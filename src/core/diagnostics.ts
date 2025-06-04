import * as vscode from "vscode";
import { CONFIG_SECTION, ERROR_DESCRIPTIONS } from "../utils/constants";
import { Debugger } from "../utils/debugger";
import { IErrorCode } from "../utils/types";

/*

Static class for managing VS Code diagnostic collection and severity levels ::::::::::::::::::::

*/

export class Diagnostics {
  private static readonly collection: vscode.DiagnosticCollection =
    vscode.languages.createDiagnosticCollection("coding-style");

  /*

Determines the VS Code diagnostic severity level based on a string input ::::::::::::::::::::

*/

  private static getSeverityLevel(severity: string): vscode.DiagnosticSeverity {
    const severityMap: Record<string, vscode.DiagnosticSeverity> = {
      MAJOR: vscode.DiagnosticSeverity.Warning,
      MINOR: vscode.DiagnosticSeverity.Warning,
      INFO: vscode.DiagnosticSeverity.Information,
    };
    const level = severityMap[severity];
    if (level !== undefined) return level;
    Debugger.warn("Diagnostics", "Unknown severity level", { severity });
    return vscode.DiagnosticSeverity.Hint;
  }

  /*

Creates a new VS Code diagnostic object from a given error code and details ::::::::::::::::::

*/

  private static createDiagnostic(error: IErrorCode): vscode.Diagnostic {
    const severity = this.getSeverityLevel(error.severity);
    const description =
      ERROR_DESCRIPTIONS[error.code] || "No description available";
    const range = new vscode.Range(error.line, 0, error.line, Number.MAX_VALUE);

    Debugger.info("Diagnostics", "Creating diagnostic", {
      code: error.code,
      line: error.line,
      severity,
      description,
    });

    const diagnostic = new vscode.Diagnostic(
      range,
      `${error.code} - ${description}`,
      severity
    );

    diagnostic.source = CONFIG_SECTION;
    diagnostic.code = error.code;

    return diagnostic;
  }

  /*

Updates the diagnostic collection for a specific URI with a list of errors :::::::::::::::::::

*/

  public static updateDiagnostics(uri: vscode.Uri, errors: IErrorCode[]): void {
    Debugger.info("Diagnostics", "Updating diagnostics", {
      file: uri.fsPath,
      errorCount: errors.length,
    });

    const diagnostics = errors.map((error) => this.createDiagnostic(error));
    this.collection.set(uri, diagnostics);
  }

  /*

Clears all diagnostics from the collection, removing them from all files ::::::::::::::::::::

*/

  public static clearDiagnostics(): void {
    Debugger.info("Diagnostics", "Clearing all diagnostics");
    this.collection.clear();
  }

  /*

Disposes of the diagnostic collection, releasing all associated resources ::::::::::::::::::::

*/

  public static dispose(): void {
    Debugger.info("Diagnostics", "Disposing diagnostic collection");
    this.collection.dispose();
  }
}
