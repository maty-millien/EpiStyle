import * as vscode from "vscode";
import { ERROR_DESCRIPTIONS } from "../config/constants";
import { IErrorCode } from "../config/types";
import { Debugger } from "../utils/debugger";

export class Diagnostics {
  private static readonly collection: vscode.DiagnosticCollection =
    vscode.languages.createDiagnosticCollection("coding-style");

  private static getSeverityLevel(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case "MAJOR":
        return vscode.DiagnosticSeverity.Error;
      case "MINOR":
        return vscode.DiagnosticSeverity.Warning;
      case "INFO":
        return vscode.DiagnosticSeverity.Information;
      default:
        Debugger.warn("Diagnostics", "Unknown severity level", { severity });
        return vscode.DiagnosticSeverity.Hint;
    }
  }

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

    diagnostic.source = "epitech-coding-style";
    diagnostic.code = error.code;

    return diagnostic;
  }

  public static updateDiagnostics(uri: vscode.Uri, errors: IErrorCode[]): void {
    Debugger.info("Diagnostics", "Updating diagnostics", {
      file: uri.fsPath,
      errorCount: errors.length,
    });

    const diagnostics = errors.map((error) => this.createDiagnostic(error));
    this.collection.set(uri, diagnostics);
  }

  public static clearDiagnostics(): void {
    Debugger.info("Diagnostics", "Clearing all diagnostics");
    this.collection.clear();
  }

  public static dispose(): void {
    Debugger.info("Diagnostics", "Disposing diagnostic collection");
    this.collection.dispose();
  }
}
