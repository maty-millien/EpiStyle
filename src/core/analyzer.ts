import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FAST_PATH_EXTENSIONS, getLogPath } from "../utils/constants";
import { Debugger } from "../utils/debugger";
import { hasCFile } from "../utils/search";
import { IFileErrors } from "../utils/types";
import { Diagnostics } from "./diagnostics";
import { Docker } from "./docker";
import { Indicator } from "./indicator";
import { Parser } from "./parser";
import { Settings } from "./settings";

type QueuedTask =
  | { kind: "workspace" }
  | { kind: "file"; uri: vscode.Uri; folder: vscode.WorkspaceFolder };

export class Analyzer {
  private static instance: Analyzer;

  private context: vscode.ExtensionContext | null = null;

  // Serialized task queue. Fast-path tasks are deduplicated per file; a
  // pending workspace task preempts any pending fast-path tasks to avoid
  // redundant work and race-condition clobbers.
  private busy = false;
  private pendingWorkspace = false;
  private pendingFiles = new Map<string, QueuedTask>();

  // Per-file error counts so the indicator reflects the live total after a
  // fast-path update without rescanning the whole workspace.
  private errorCountByFile = new Map<string, number>();
  private totalErrors = 0;

  // Cache of "does this workspace folder contain any C files" keyed by folder
  // path. Invalidated on create/delete/rename events from the extension host.
  private hasCFileCache = new Map<string, boolean>();

  public static getInstance(): Analyzer {
    if (!Analyzer.instance) {
      Analyzer.instance = new Analyzer();
    }
    return Analyzer.instance;
  }

  public init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public invalidateProjectCache(): void {
    this.hasCFileCache.clear();
  }

  public clearFile(uri: vscode.Uri): void {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }
    const key = this.fileKey(workspaceFolder, uri.fsPath);
    const prev = this.errorCountByFile.get(key) ?? 0;
    if (prev > 0) {
      this.totalErrors -= prev;
      this.errorCountByFile.delete(key);
      this.refreshIndicator();
    }
    Diagnostics.delete(uri);
  }

  public scheduleFile(uri: vscode.Uri): void {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!FAST_PATH_EXTENSIONS.has(ext)) {
      // Makefile / other — fall back to the full workspace check.
      this.scheduleWorkspace();
      return;
    }
    this.pendingFiles.set(uri.fsPath, {
      kind: "file",
      uri,
      folder: workspaceFolder,
    });
    void this.drain();
  }

  public scheduleWorkspace(): void {
    this.pendingWorkspace = true;
    // A queued full-workspace run supersedes any pending per-file runs.
    this.pendingFiles.clear();
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.busy) {
      return;
    }
    const next = this.pickNext();
    if (!next) {
      return;
    }
    this.busy = true;

    // Fast-path tasks don't manage the indicator themselves; drain shows the
    // loading spinner at the start and refreshes once the queue is empty so
    // rapid saves don't flicker between "checking" and "clean".
    // Slow-path (workspace) tasks manage their own indicator lifecycle, which
    // includes the special "Not a C Project" disabled state.
    if (next.kind === "file") {
      Indicator.getInstance().startLoadingAnimation();
    }

    try {
      if (next.kind === "workspace") {
        await this.runWorkspace();
      } else {
        await this.runFile(next.uri, next.folder);
      }
    } catch (error) {
      Debugger.error("Analyzer", "Task failed", {
        kind: next.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.busy = false;
      const hasMore = this.pendingWorkspace || this.pendingFiles.size > 0;
      if (hasMore) {
        void this.drain();
      } else if (next.kind === "file") {
        this.refreshIndicator();
      }
    }
  }

  private pickNext(): QueuedTask | null {
    if (this.pendingWorkspace) {
      this.pendingWorkspace = false;
      return { kind: "workspace" };
    }
    const iter = this.pendingFiles.entries().next();
    if (iter.done) {
      return null;
    }
    const [key, task] = iter.value;
    this.pendingFiles.delete(key);
    return task;
  }

  // ---- Fast path: single-file vera++ run ------------------------------------

  private async runFile(
    uri: vscode.Uri,
    folder: vscode.WorkspaceFolder,
  ): Promise<void> {
    const settings = Settings.getInstance();
    if (!settings.isEnabled()) {
      return;
    }
    if (!(await this.ensureIsCProject(folder))) {
      return;
    }

    const workspacePath = folder.uri.fsPath;
    const relativePath = path.relative(workspacePath, uri.fsPath);
    if (!relativePath || relativePath.startsWith("..")) {
      return;
    }

    // Stop if the user disabled analysis mid-run.
    if (!settings.isEnabled()) {
      return;
    }

    const stdout = await Docker.getInstance().executeCheckFile(
      folder,
      relativePath,
    );

    if (!settings.isEnabled()) {
      return;
    }

    const fileErrorsMap = Parser.parseReportContent(
      stdout,
      workspacePath,
      settings.getExcludePaths(),
    );

    const normalizedRelative = relativePath.split(path.sep).join("/");
    const fileErrors = fileErrorsMap[normalizedRelative] ?? [];

    const key = this.fileKey(folder, uri.fsPath);
    const prev = this.errorCountByFile.get(key) ?? 0;
    const next = fileErrors.length;
    this.totalErrors += next - prev;
    if (next === 0) {
      this.errorCountByFile.delete(key);
    } else {
      this.errorCountByFile.set(key, next);
    }

    Diagnostics.update(uri, fileErrors);
  }

  // ---- Slow path: full workspace scan via check.sh --------------------------

  private async runWorkspace(): Promise<number> {
    const context = this.context;
    if (!context) {
      throw new Error("Analyzer.init was not called");
    }
    const indicator = Indicator.getInstance();
    const settings = Settings.getInstance();

    if (!settings.isEnabled()) {
      return 0;
    }

    indicator.startLoadingAnimation();

    const bailIfDisabled = (): boolean => {
      if (settings.isEnabled()) {
        return false;
      }
      this.resetCounters();
      Diagnostics.clear();
      indicator.updateStatus(0, false);
      return true;
    };

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

      this.resetCounters();
      Diagnostics.clear();

      let foundCFile = false;
      for (const workspaceFolder of workspaceFolders) {
        if (await this.ensureIsCProject(workspaceFolder)) {
          foundCFile = true;
          break;
        }
      }

      if (bailIfDisabled()) {
        return 0;
      }

      if (!foundCFile) {
        await settings.setEnabled(false);
        indicator.updateStatus(0, false, "$(error) Not a C Project");
        return 0;
      }

      for (const workspaceFolder of workspaceFolders) {
        if (!(await this.ensureIsCProject(workspaceFolder))) {
          continue;
        }
        const projectRoot = workspaceFolder.uri.fsPath;

        const reportPath = getLogPath(projectRoot);
        if (fs.existsSync(reportPath)) {
          fs.unlinkSync(reportPath);
        }

        const newReportPath =
          await Docker.getInstance().executeCheck(workspaceFolder);

        if (bailIfDisabled()) {
          return 0;
        }

        const fileErrorsMap = Parser.parseReport(
          newReportPath,
          projectRoot,
          settings.getExcludePaths(),
        );

        if (!settings.shouldPersistLogFile() && fs.existsSync(newReportPath)) {
          fs.unlinkSync(newReportPath);
        }

        this.absorbWorkspaceResults(workspaceFolder, fileErrorsMap);
      }

      if (bailIfDisabled()) {
        return 0;
      }

      indicator.updateStatus(this.totalErrors, true);
      return this.totalErrors;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to analyze workspace\n${error}`);
      indicator.updateStatus(0, settings.isEnabled());
      return 0;
    }
  }

  private absorbWorkspaceResults(
    folder: vscode.WorkspaceFolder,
    fileErrorsMap: IFileErrors,
  ): void {
    const projectRoot = folder.uri.fsPath;
    Object.entries(fileErrorsMap).forEach(([relativePath, errors]) => {
      const absolutePath = path.resolve(projectRoot, relativePath);
      const fileUri = vscode.Uri.file(absolutePath);
      Diagnostics.update(fileUri, errors);

      const key = this.fileKey(folder, absolutePath);
      this.errorCountByFile.set(key, errors.length);
      this.totalErrors += errors.length;
    });
  }

  private resetCounters(): void {
    this.errorCountByFile.clear();
    this.totalErrors = 0;
  }

  private refreshIndicator(): void {
    const settings = Settings.getInstance();
    Indicator.getInstance().updateStatus(
      this.totalErrors,
      settings.isEnabled(),
    );
  }

  private async ensureIsCProject(
    folder: vscode.WorkspaceFolder,
  ): Promise<boolean> {
    const key = folder.uri.fsPath;
    const cached = this.hasCFileCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = await hasCFile(key);
    this.hasCFileCache.set(key, result);
    return result;
  }

  private fileKey(folder: vscode.WorkspaceFolder, fsPath: string): string {
    return `${folder.uri.fsPath}::${fsPath}`;
  }
}
