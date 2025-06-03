import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, getLogPath } from "../config/constants";
import { Diagnostics } from "../core/diagnostics";
import { Docker } from "../core/docker";
import { Parser } from "../core/parser";
import { Debugger } from "../utils/debugger";

export class AnalyzerService {
  private static instance: AnalyzerService;
  private isAnalysisRunning: boolean = false;
  private debounceTimer: NodeJS.Timeout | undefined;
  private static readonly DEBOUNCE_DELAY = 500; // ms

  private constructor() {}

  public static getInstance(): AnalyzerService {
    if (!AnalyzerService.instance)
      AnalyzerService.instance = new AnalyzerService();
    return AnalyzerService.instance;
  }

  private isDocumentValid(doc: vscode.TextDocument): boolean {
    if (BANNED_EXTENSIONS.includes(doc.languageId)) return false;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      Debugger.info("AnalyzerService", "No workspace folder found");
      return false;
    }
    return true;
  }

  private clearDebounceTimer() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  public async analyze(
    doc: vscode.TextDocument,
    context: vscode.ExtensionContext
  ): Promise<number> {
    if (this.isAnalysisRunning) {
      Debugger.info("AnalyzerService", "Analysis already running, debouncing");
      this.clearDebounceTimer();

      return new Promise((resolve) => {
        this.debounceTimer = setTimeout(async () => {
          const result = await this.analyze(doc, context);
          resolve(result);
        }, AnalyzerService.DEBOUNCE_DELAY);
      });
    }

    if (!this.isDocumentValid(doc)) return 0;

    this.isAnalysisRunning = true;
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)!;
      Diagnostics.clearDiagnostics();

      let reportPath = getLogPath(workspaceFolder.uri.fsPath);
      if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
      }

      reportPath = await Docker.executeCheck(context, workspaceFolder);
      const fileErrorsMap = Parser.parseReport(
        reportPath,
        workspaceFolder.uri.fsPath
      );

      const totalErrors = Object.values(fileErrorsMap).reduce(
        (sum, errors: any[]) => sum + errors.length,
        0
      );

      Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
        const absolutePath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        const fileUri = vscode.Uri.file(absolutePath);
        Diagnostics.updateDiagnostics(fileUri, errors);
      });

      return totalErrors;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Debugger.error("AnalyzerService", "Analysis failed", {
        error: errorMessage,
      });
      void vscode.window.showErrorMessage(
        `Failed to analyze workspace\n${errorMessage}`
      );
      return 0;
    } finally {
      this.isAnalysisRunning = false;
      this.clearDebounceTimer();
    }
  }
}
