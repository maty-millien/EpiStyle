import * as vscode from "vscode";

class DebugLogger {
  private static channel: vscode.OutputChannel;

  static initialize() {
    this.channel = vscode.window.createOutputChannel("Epitech Coding Style");
  }

  static log(component: string, action: string, details?: any) {
    if (!this.channel) {
      this.initialize();
    }
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${component}] ${action}`;
    this.channel.appendLine(message);
    if (details) {
      this.channel.appendLine(JSON.stringify(details, null, 2));
    }
  }
}

export const debug = DebugLogger;
