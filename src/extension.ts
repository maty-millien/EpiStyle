import * as path from "path";

import * as vscode from "vscode";

import * as analyzer from "./analyzer";
import * as checker from "./checker";
import {
  CONFIG_SECTION,
  REBUILD_COMMAND,
  TOGGLE_COMMAND,
  errorMessage,
  isCSource,
  isEnabled,
  log,
  setEnabled,
} from "./config";
import * as ui from "./ui";

const INSTALL_HINT =
  "Install Docker (or a compatible runtime such as OrbStack, Colima, or Rancher Desktop), or epiclang from the Epitech PPA, then click Retry.";

async function handleStartError(error: unknown): Promise<void> {
  ui.showStatus(0, false, "$(error) EpiStyle unavailable");
  const reason =
    error instanceof checker.CheckerUnavailableError ? error.reason : "other";
  const message =
    reason === "cli-missing"
      ? `EpiStyle: neither epiclang nor Docker was found. ${INSTALL_HINT}`
      : reason === "daemon-down"
        ? "EpiStyle: Docker is not running. Start your Docker runtime, then click Retry."
        : `EpiStyle: ${errorMessage(error)}`;
  if ((await vscode.window.showErrorMessage(message, "Retry")) === "Retry") {
    startChecker(false);
  }
}

function startChecker(rebuild: boolean): void {
  ui.showChecking();
  analyzer.invalidateProjects();
  (rebuild ? checker.rebuild() : checker.init()).then(
    () => analyzer.scheduleWorkspace(),
    (error: unknown) => void handleStartError(error),
  );
}

function mayContainSources(uri: vscode.Uri): boolean {
  return isCSource(uri) || path.posix.extname(uri.path) === "";
}

function onFilesChanged(
  changed: readonly vscode.Uri[],
  removed: readonly vscode.Uri[],
): void {
  if (!changed.some(mayContainSources)) {
    return;
  }
  removed.forEach(analyzer.clearFile);
  analyzer.invalidateProjects();
  analyzer.scheduleWorkspace();
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    log,
    ...ui.disposables,
    vscode.commands.registerCommand(TOGGLE_COMMAND, () => setEnabled(!isEnabled())),
    vscode.commands.registerCommand(REBUILD_COMMAND, () => startChecker(true)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isEnabled() && isCSource(doc.uri)) {
        analyzer.scheduleFile(doc.uri);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.excludePaths`)) {
        analyzer.invalidateProjects();
      } else if (!event.affectsConfiguration(`${CONFIG_SECTION}.enable`)) {
        return;
      }
      if (isEnabled()) {
        analyzer.scheduleWorkspace();
      } else {
        analyzer.reset();
        ui.showStatus(0, false);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      await Promise.all(
        event.removed.map((folder) => checker.stopFolder(folder.uri.fsPath)),
      );
      analyzer.invalidateProjects();
      analyzer.scheduleWorkspace();
    }),
    vscode.workspace.onDidCreateFiles(({ files }) => onFilesChanged(files, [])),
    vscode.workspace.onDidDeleteFiles(({ files }) => onFilesChanged(files, files)),
    vscode.workspace.onDidRenameFiles(({ files }) => {
      const oldUris = files.map(({ oldUri }) => oldUri);
      onFilesChanged([...oldUris, ...files.map(({ newUri }) => newUri)], oldUris);
    }),
  );

  startChecker(false);
}

export function deactivate(): Thenable<void> {
  return checker.stopAll();
}
