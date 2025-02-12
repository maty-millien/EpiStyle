import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, TEMP_REPORT_PATH } from "./constants";
import { debug } from "./debug";
import { createDiagnostics } from "./diagnostics";
import { executeDockerCheck } from "./docker";
import { parseReportFile } from "./parser";

export function activate(context: vscode.ExtensionContext) {
  debug.log("Extension", "Activating extension");
  const collection =
    vscode.languages.createDiagnosticCollection("coding-style");

  const runAnalysis = async (doc: vscode.TextDocument) => {
    debug.log("Extension", "Starting analysis", {
      fileName: doc.fileName,
      languageId: doc.languageId,
    });

    const config = vscode.workspace.getConfiguration("epitech-coding-style");
    if (!config.get("enable")) {
      debug.log("Extension", "Extension disabled, clearing diagnostics");
      collection.clear();
      return;
    }

    if (BANNED_EXTENSIONS.includes(doc.languageId)) {
      debug.log("Extension", "Skipping banned extension", {
        languageId: doc.languageId,
      });
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      debug.log("Extension", "No workspace folder found");
      return;
    }

    try {
      debug.log("Extension", "Running Docker check");
      await executeDockerCheck(doc.fileName, context);

      debug.log("Extension", "Parsing report file");
      const fileErrorsMap = parseReportFile(
        TEMP_REPORT_PATH,
        workspaceFolder.uri.fsPath
      );

      debug.log("Extension", "Updating diagnostics");
      collection.clear();
      Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
        const absolutePath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        const fileUri = vscode.Uri.file(absolutePath);
        const diagnostics = createDiagnostics(errors);
        collection.set(fileUri, diagnostics);
        debug.log("Extension", "Set diagnostics for file", {
          filePath,
          errorCount: errors.length,
        });
      });

      // Clean up temp report file
      if (fs.existsSync(TEMP_REPORT_PATH)) {
        debug.log("Extension", "Cleaning up temp report file");
        fs.unlinkSync(TEMP_REPORT_PATH);
      }
    } catch (error) {
      debug.log("Extension", "Analysis failed", { error });
      vscode.window.showErrorMessage(`Coding style check failed: ${error}`);
      // Ensure cleanup even on error
      if (fs.existsSync(TEMP_REPORT_PATH)) {
        fs.unlinkSync(TEMP_REPORT_PATH);
      }
    }
  };

  debug.log("Extension", "Registering event handlers");
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(runAnalysis),
    vscode.workspace.onDidOpenTextDocument(runAnalysis),
    vscode.workspace.onDidChangeConfiguration((event) => {
      debug.log("Extension", "Configuration changed", {
        affectsCodingStyle: event.affectsConfiguration(
          "epitech-coding-style.enable"
        ),
      });

      if (event.affectsConfiguration("epitech-coding-style.enable")) {
        const config = vscode.workspace.getConfiguration(
          "epitech-coding-style"
        );
        if (!config.get("enable")) {
          debug.log("Extension", "Extension disabled via config change");
          collection.clear();
        } else {
          debug.log(
            "Extension",
            "Extension enabled via config change, running analysis"
          );
          vscode.workspace.textDocuments.forEach(runAnalysis);
        }
      }
    })
  );

  debug.log("Extension", "Extension activated successfully");
}

export function deactivate() {
  debug.log("Extension", "Extension deactivated");
}
