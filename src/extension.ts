import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, getLogPath } from "./constants";
import { DebugLogger } from "./debug";
import { DiagnosticsService } from "./diagnostics";
import { DockerService } from "./docker";
import { ParserService } from "./parser";

export class CodingStyleExtension {
  private static readonly configSection = "epitech-coding-style";

  private constructor() {} // Prevent instantiation

  private static isDocumentValid(doc: vscode.TextDocument): boolean {
    if (BANNED_EXTENSIONS.includes(doc.languageId)) {
      DebugLogger.debug("Extension", "Skipping banned extension", {
        languageId: doc.languageId,
      });
      return false;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      DebugLogger.debug("Extension", "No workspace folder found");
      return false;
    }

    return true;
  }

  private static async analyzeDocument(
    doc: vscode.TextDocument,
    context: vscode.ExtensionContext
  ): Promise<void> {
    let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;

    try {
      DebugLogger.info("Extension", "Starting document analysis", {
        file: doc.fileName,
        languageId: doc.languageId,
      });

      const config = vscode.workspace.getConfiguration(this.configSection);
      if (!config.get("enable")) {
        DebugLogger.info(
          "Extension",
          "Extension disabled, clearing diagnostics"
        );
        DiagnosticsService.clearDiagnostics();
        return;
      }

      if (!this.isDocumentValid(doc)) {
        return;
      }

      currentWorkspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)!;
      const reportPath = await DockerService.executeCheck(
        doc.fileName,
        context
      );

      const fileErrorsMap = ParserService.parseReport(
        reportPath,
        currentWorkspaceFolder.uri.fsPath
      );

      // Update diagnostics for all files
      Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
        const absolutePath = path.resolve(
          currentWorkspaceFolder!.uri.fsPath,
          filePath
        );
        const fileUri = vscode.Uri.file(absolutePath);
        DiagnosticsService.updateDiagnostics(fileUri, errors);
      });

      // Clean up report file
      const logPath = getLogPath(currentWorkspaceFolder.uri.fsPath);
      if (fs.existsSync(logPath)) {
        DebugLogger.debug("Extension", "Cleaning up report file");
        fs.unlinkSync(logPath);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      DebugLogger.error("Extension", "Analysis failed", {
        error: errorMessage,
      });
      void vscode.window.showErrorMessage(
        `Coding style check failed: ${errorMessage}`
      );

      // Ensure cleanup on error
      if (currentWorkspaceFolder) {
        const logPath = getLogPath(currentWorkspaceFolder.uri.fsPath);
        if (fs.existsSync(logPath)) {
          fs.unlinkSync(logPath);
        }
      }
    }
  }

  public static activate(context: vscode.ExtensionContext): void {
    DebugLogger.info("Extension", "Activating extension");

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(
        (doc) => void this.analyzeDocument(doc, context)
      ),
      vscode.workspace.onDidOpenTextDocument(
        (doc) => void this.analyzeDocument(doc, context)
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${this.configSection}.enable`)) {
          const config = vscode.workspace.getConfiguration(this.configSection);
          if (!config.get("enable")) {
            DiagnosticsService.clearDiagnostics();
          } else {
            vscode.workspace.textDocuments.forEach(
              (doc) => void this.analyzeDocument(doc, context)
            );
          }
        }
      })
    );

    DebugLogger.info("Extension", "Extension activated successfully");
  }

  public static deactivate(): void {
    DebugLogger.info("Extension", "Extension deactivated");
    DiagnosticsService.dispose();
  }
}

// Export activation functions
export function activate(context: vscode.ExtensionContext): void {
  CodingStyleExtension.activate(context);
}

export function deactivate(): void {
  CodingStyleExtension.deactivate();
}
