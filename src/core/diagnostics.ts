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
    const diagnostics = errors.map((error) => this.createDiagnostic(error));
    this.collection.set(uri, diagnostics);
  }

  /*

Clears all diagnostics from the collection, removing them from all files ::::::::::::::::::::

*/

  public static clearDiagnostics(): void {
    this.collection.clear();
  }

  /*

  Counts the total number of diagnostics across all files in the collection.:::::::::::::::::::::

  */

  public static getTotalErrors(): number {
    let total = 0;
    this.collection.forEach((uri, diagnostics) => {
      total += diagnostics.length;
    });
    return total;
  }

  /*

Disposes of the diagnostic collection, releasing all associated resources ::::::::::::::::::::

*/

  public static dispose(): void {
    this.collection.dispose();
  }
}
