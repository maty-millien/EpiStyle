import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, getLogPath } from "../utils/constants";
import { Diagnostics } from "./diagnostics";
import { Docker } from "./docker";
import { Parser } from "./parser";

/*

AnalyzerService class - main entry point for analysis operations::::::::::::::::::::::::::::::

*/

export class Analyzer {
  /*

Class properties - state and configuration:::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static instance: Analyzer;
  private isAnalysisRunning: boolean = false;
  private debounceTimer: NodeJS.Timeout | undefined;
  private static readonly DEBOUNCE_DELAY = 500; // ms

  /*

Singleton instance accessor::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static getInstance(): Analyzer {
    if (!Analyzer.instance)
      Analyzer.instance = new Analyzer();
    return Analyzer.instance;
  }

  /*

Document validation - checks if file should be analyzed:::::::::::::::::::::::::::::::::::::::::

*/

  private isDocumentValid(doc: vscode.TextDocument): boolean {
    if (BANNED_EXTENSIONS.includes(doc.languageId)) return false;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) return false;
    return true;
  }

  /*

Debounce management - prevents overlapping analysis runs::::::::::::::::::::::::::::::::::::::::

*/

  private clearDebounceTimer() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /*

Main analysis workflow - runs coding style checks:::::::::::::::::::::::::::::::::::::::::::::::

*/

  public async analyze(
    doc: vscode.TextDocument,
    context: vscode.ExtensionContext
  ): Promise<number> {
    if (this.isAnalysisRunning) {
      this.clearDebounceTimer();

      return new Promise((resolve) => {
        this.debounceTimer = setTimeout(async () => {
          const result = await this.analyze(doc, context);
          resolve(result);
        }, Analyzer.DEBOUNCE_DELAY);
      });
    }

    if (!this.isDocumentValid(doc)) return 0;

    this.isAnalysisRunning = true;
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)!;

      Diagnostics.updateDiagnostics(doc.uri, []);

      const reportPath = getLogPath(workspaceFolder.uri.fsPath);
      if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

      const newReportPath = await Docker.executeCheck(context, workspaceFolder);
      const fileErrorsMap = Parser.parseReport(
        newReportPath,
        workspaceFolder.uri.fsPath
      );

      /*

Result processing - aggregates errors and updates diagnostics:::::::::::::::::::::::::::::::::::

*/

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
