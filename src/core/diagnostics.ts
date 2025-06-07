import * as vscode from "vscode";
import { CONFIG_SECTION, ERROR_DESCRIPTIONS } from "../utils/constants";
import { Debugger } from "../utils/debugger";
import { IErrorCode } from "../utils/types";

export class Diagnostics {
  private static readonly collection: vscode.DiagnosticCollection =
    vscode.languages.createDiagnosticCollection("coding-style");

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

  private static create(error: IErrorCode): vscode.Diagnostic {
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

  public static update(uri: vscode.Uri, errors: IErrorCode[]): void {
    const diagnostics = errors.map((error) => this.create(error));
    this.collection.set(uri, diagnostics);
  }

  public static clear(): void {
    this.collection.clear();
  }

  public static getTotalErrors(): number {
    let total = 0;
    this.collection.forEach((uri, diagnostics) => {
      total += diagnostics.length;
    });
    return total;
  }

  public static dispose(): void {
    this.collection.dispose();
  }
}
