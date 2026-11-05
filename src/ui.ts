import * as vscode from "vscode";

import type { Severity, StyleError } from "./checker";
import { CONFIG_SECTION, TOGGLE_COMMAND } from "./config";

const SEVERITIES: Record<Severity, vscode.DiagnosticSeverity> = {
  Fatal: vscode.DiagnosticSeverity.Error,
  Major: vscode.DiagnosticSeverity.Warning,
  Minor: vscode.DiagnosticSeverity.Warning,
  Info: vscode.DiagnosticSeverity.Information,
};

const collection = vscode.languages.createDiagnosticCollection("coding-style");
const statusItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100,
);
statusItem.name = "EpiStyle";
statusItem.command = TOGGLE_COMMAND;
statusItem.show();

export const disposables = [collection, statusItem];

function toDiagnostic(error: StyleError): vscode.Diagnostic {
  const position = new vscode.Position(error.line, error.column);
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(position, position),
    `${error.code} - ${error.description}`,
    SEVERITIES[error.severity],
  );
  diagnostic.source = CONFIG_SECTION;
  diagnostic.code = error.code;
  return diagnostic;
}

export function setDiagnostics(uri: vscode.Uri, errors: StyleError[]): void {
  collection.set(uri, errors.map(toDiagnostic));
}

export function deleteDiagnostics(uri: vscode.Uri): void {
  collection.delete(uri);
}

export function clearDiagnostics(): void {
  collection.clear();
}

export function showChecking(): void {
  statusItem.text = "$(loading~spin) EpiStyle: Checking";
  statusItem.backgroundColor = undefined;
  statusItem.color = undefined;
}

export function showStatus(errorCount: number, enabled: boolean, message?: string): void {
  if (!enabled || errorCount === 0) {
    statusItem.text = enabled
      ? "$(check) EpiStyle: Clean"
      : (message ?? "$(debug-disconnect) EpiStyle: Off");
    statusItem.backgroundColor = undefined;
    statusItem.color = undefined;
    return;
  }
  statusItem.text = `$(alert) EpiStyle: ${errorCount} Warning${errorCount > 1 ? "s" : ""}`;
  statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  statusItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
}
