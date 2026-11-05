import * as fs from "fs";
import * as path from "path";

import ignore, { type Ignore } from "ignore";
import * as vscode from "vscode";

import * as checker from "./checker";
import type { FileErrors, StyleError } from "./checker";
import { errorMessage, getExcludePaths, isEnabled, log } from "./config";
import * as ui from "./ui";

const WORKSPACE_JOBS = 4;

interface Project {
  sources: string[];
  includeDirs: string[];
  ignores: Ignore;
}

interface FileState {
  uri: vscode.Uri;
  style: StyleError[];
  repo: StyleError[];
}

const projects = new Map<string, Promise<Project>>();
const files = new Map<string, FileState>();
let isCProject = true;

let busy = false;
let pendingWorkspace = false;
const pendingFiles = new Map<string, vscode.Uri>();

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

async function scanProject(folder: vscode.WorkspaceFolder): Promise<Project> {
  const gitignore = await fs.promises
    .readFile(path.join(folder.uri.fsPath, ".gitignore"), "utf-8")
    .catch(() => "");
  const ignores = ignore().add(getExcludePaths()).add(gitignore);
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.{c,h}"),
  );
  const all = uris
    .map((uri) => toPosix(path.relative(folder.uri.fsPath, uri.fsPath)))
    .toSorted();
  const includeDirs = [
    ...new Set(all.filter((f) => f.endsWith(".h")).map((f) => path.posix.dirname(f))),
  ];
  return {
    sources: all.filter((f) => !ignores.ignores(f)),
    includeDirs,
    ignores,
  };
}

function getProject(folder: vscode.WorkspaceFolder): Promise<Project> {
  const key = folder.uri.fsPath;
  let project = projects.get(key);
  if (!project) {
    project = scanProject(folder);
    project.catch(() => projects.delete(key));
    projects.set(key, project);
  }
  return project;
}

export function invalidateProjects(): void {
  projects.clear();
}

function setErrors(uri: vscode.Uri, kind: "style" | "repo", errors: StyleError[]): void {
  const key = uri.toString();
  const state = files.get(key) ?? { uri, style: [], repo: [] };
  state[kind] = errors;
  if (state.style.length === 0 && state.repo.length === 0) {
    files.delete(key);
    ui.deleteDiagnostics(uri);
    return;
  }
  files.set(key, state);
  ui.setDiagnostics(uri, [...state.repo, ...state.style]);
}

function applyResults(
  root: vscode.Uri,
  kind: "style" | "repo",
  results: FileErrors,
): void {
  for (const [relativePath, errors] of results) {
    setErrors(vscode.Uri.joinPath(root, relativePath), kind, errors);
  }
}

export function clearFile(uri: vscode.Uri): void {
  const prefix = `${uri.toString()}/`;
  for (const [key, state] of files) {
    if (key === uri.toString() || key.startsWith(prefix)) {
      files.delete(key);
      ui.deleteDiagnostics(state.uri);
    }
  }
}

export function reset(): void {
  files.clear();
  ui.clearDiagnostics();
}

function refreshStatus(): void {
  if (!isCProject) {
    ui.showStatus(0, false, "$(error) Not a C Project");
    return;
  }
  let total = 0;
  for (const state of files.values()) {
    total += state.style.length + state.repo.length;
  }
  ui.showStatus(total, isEnabled());
}

async function runFile(uri: vscode.Uri): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder || !isEnabled()) {
    return;
  }
  const project = await getProject(folder);
  const relativePath = toPosix(path.relative(folder.uri.fsPath, uri.fsPath));
  if (relativePath.startsWith("..") || project.ignores.ignores(relativePath)) {
    return;
  }
  const results = await checker.checkFiles(
    folder.uri.fsPath,
    [relativePath],
    project.includeDirs,
  );
  if (isEnabled()) {
    setErrors(uri, "style", results.get(relativePath) ?? []);
  }
}

function splitEvenly<T>(items: T[], parts: number): T[][] {
  const chunks: T[][] = [];
  const size = Math.ceil(items.length / parts);
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runWorkspace(): Promise<void> {
  if (!isEnabled()) {
    return;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  const scanned = await Promise.all(
    folders.map(async (folder) => ({ folder, project: await getProject(folder) })),
  );
  const cProjects = scanned.filter(({ project }) => project.sources.length > 0);
  isCProject = cProjects.length > 0;
  reset();

  await Promise.all(cProjects.map(({ folder, project }) => checkFolder(folder, project)));
}

async function checkFolder(
  folder: vscode.WorkspaceFolder,
  project: Project,
): Promise<void> {
  const root = folder.uri.fsPath;
  const [repo, ...styles] = await Promise.all([
    checker.checkRepo(root),
    ...splitEvenly(project.sources, WORKSPACE_JOBS).map((chunk) =>
      checker.checkFiles(root, chunk, project.includeDirs),
    ),
  ]);
  if (!isEnabled()) {
    return;
  }
  for (const [relativePath, errors] of repo) {
    if (!project.ignores.ignores(relativePath)) {
      setErrors(vscode.Uri.joinPath(folder.uri, relativePath), "repo", errors);
    }
  }
  for (const style of styles) {
    applyResults(folder.uri, "style", style);
  }
}

async function drain(): Promise<void> {
  if (busy) {
    return;
  }
  const workspace = pendingWorkspace;
  const next = pendingFiles.values().next().value;
  if (!workspace && !next) {
    return;
  }
  busy = true;
  ui.showChecking();

  try {
    if (workspace) {
      pendingWorkspace = false;
      await runWorkspace();
    } else if (next) {
      pendingFiles.delete(next.toString());
      await runFile(next);
    }
  } catch (error) {
    log.error(`Check failed: ${errorMessage(error)}`);
    if (workspace) {
      void vscode.window.showErrorMessage(`EpiStyle: ${errorMessage(error)}`);
    }
  } finally {
    busy = false;
    if (pendingWorkspace || pendingFiles.size > 0) {
      void drain();
    } else {
      refreshStatus();
    }
  }
}

export function scheduleFile(uri: vscode.Uri): void {
  if (pendingWorkspace) {
    return;
  }
  pendingFiles.set(uri.toString(), uri);
  void drain();
}

export function scheduleWorkspace(): void {
  pendingWorkspace = true;
  pendingFiles.clear();
  void drain();
}
