import * as vscode from "vscode";
import { ERROR_DESCRIPTIONS, ErrorCode } from "./constants";
import { debug } from "./debug";

/**
 * Returns the VS Code diagnostic severity based on the error severity.
 * @param severity - Error severity string.
 */
function getSeverityLevel(severity: string): vscode.DiagnosticSeverity {
  debug.log("Diagnostics", "Converting severity level", { input: severity });
  let result;
  switch (severity) {
    case "MAJOR":
      result = vscode.DiagnosticSeverity.Error;
      break;
    case "MINOR":
      result = vscode.DiagnosticSeverity.Warning;
      break;
    case "INFO":
      result = vscode.DiagnosticSeverity.Information;
      break;
    default:
      result = vscode.DiagnosticSeverity.Hint;
  }
  debug.log("Diagnostics", "Converted severity", {
    input: severity,
    output: result,
  });
  return result;
}

/**
 * Creates diagnostics from an array of error codes.
 * @param errors - An array of errors.
 */
export function createDiagnostics(errors: ErrorCode[]): vscode.Diagnostic[] {
  debug.log("Diagnostics", "Creating diagnostics", {
    errorCount: errors.length,
  });

  const diagnostics = errors.map((error) => {
    const severity = getSeverityLevel(error.severity);
    const description =
      ERROR_DESCRIPTIONS[error.code] || "No description available";
    const range = new vscode.Range(error.line, 0, error.line, Number.MAX_VALUE);

    debug.log("Diagnostics", "Creating diagnostic", {
      code: error.code,
      line: error.line,
      severity,
      description,
    });

    return new vscode.Diagnostic(
      range,
      `${error.code} - ${description}`,
      severity
    );
  });

  debug.log("Diagnostics", "Created diagnostics", {
    count: diagnostics.length,
  });
  return diagnostics;
}
