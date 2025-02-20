import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, getLogPath } from "./constants";
import { Debugger } from "./debug";
import { Diagnostics } from "./diagnostics";
import { Docker } from "./docker";
import { Parser } from "./parser";

export class Extension {
  // Add flag to track if analysis is currently running
  private static isAnalysisRunning: boolean = false;

  private static readonly configSection = "epitech-coding-style";
  private constructor() {}

  private static isDocumentValid(doc: vscode.TextDocument): boolean {
    if (BANNED_EXTENSIONS.includes(doc.languageId)) {
      return false;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      Debugger.info("Extension", "No workspace folder found");
      return false;
    }

    return true;
  }

  private static async analyzeWorkspace(
    doc: vscode.TextDocument,
    context: vscode.ExtensionContext
  ): Promise<void> {
    // If an analysis is already running, skip this run
    if (this.isAnalysisRunning) {
      Debugger.info(
        "Extension",
        "Analysis already running, skipping new analysis"
      );
      return;
    }
    this.isAnalysisRunning = true;
    try {
      let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;

      try {
        const config = vscode.workspace.getConfiguration(this.configSection);
        if (!config.get("enable")) {
          Debugger.info(
            "Extension",
            "Extension disabled, clearing diagnostics"
          );
          Diagnostics.clearDiagnostics();
          return;
        }

        if (!this.isDocumentValid(doc)) {
          return;
        }

        currentWorkspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)!;
        Diagnostics.clearDiagnostics();
        let reportPath = getLogPath(currentWorkspaceFolder.uri.fsPath);
        if (fs.existsSync(reportPath)) {
          Debugger.info("Extension", "Cleaning up old report file", {
            reportPath,
          });
          fs.unlinkSync(reportPath);
        }
        reportPath = await Docker.executeCheck(context, currentWorkspaceFolder);

        const fileErrorsMap = Parser.parseReport(
          reportPath,
          currentWorkspaceFolder.uri.fsPath
        );

        Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
          const absolutePath = path.resolve(
            currentWorkspaceFolder!.uri.fsPath,
            filePath
          );
          const fileUri = vscode.Uri.file(absolutePath);
          Diagnostics.updateDiagnostics(fileUri, errors);
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Debugger.error("Extension", "Analysis failed", {
          error: errorMessage,
        });
        void vscode.window.showErrorMessage(
          `Failed to analyze workspace\n${errorMessage}`
        );
      }
    } finally {
      this.isAnalysisRunning = false;
    }
  }

  public static activate(context: vscode.ExtensionContext): void {
    Debugger.info("Extension", "Activating extension");

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(
        (doc) => void this.analyzeWorkspace(doc, context)
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${this.configSection}.enable`)) {
          const config = vscode.workspace.getConfiguration(this.configSection);
          if (!config.get("enable")) {
            Diagnostics.clearDiagnostics();
          } else {
            vscode.workspace.textDocuments.forEach(
              (doc) => void this.analyzeWorkspace(doc, context)
            );
          }
        }
      })
    );

    Debugger.info("Extension", "Extension activated successfully");
  }

  public static deactivate(): void {
    Debugger.info("Extension", "Extension deactivated");
    Diagnostics.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  Extension.activate(context);
}

export function deactivate(): void {
  Extension.deactivate();
}
