import * as vscode from "vscode";

export const CONFIG_SECTION = "epitech-coding-style";
export const TOGGLE_COMMAND = `${CONFIG_SECTION}.toggleMenu`;
export const REBUILD_COMMAND = `${CONFIG_SECTION}.rebuildImage`;

export const log = vscode.window.createOutputChannel("EpiStyle", {
  log: true,
});

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function isEnabled(): boolean {
  return config().get<boolean>("enable") ?? true;
}

export function getExcludePaths(): string[] {
  return config().get<string[]>("excludePaths") ?? ["tests/"];
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await config().update("enable", enabled, vscode.ConfigurationTarget.Global);
}

export function isCSource(uri: vscode.Uri): boolean {
  return /\.[ch]$/i.test(uri.path);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
