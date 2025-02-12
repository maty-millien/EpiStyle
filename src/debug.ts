import * as vscode from "vscode";

export interface IDebugDetails {
  [key: string]: unknown;
}

export class DebugLogger {
  private static channel: vscode.OutputChannel;
  private static readonly logLevels = [
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
  ] as const;

  public static initialize(): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel("Epitech Coding Style");
    }
  }

  private static log(
    level: string,
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    if (!this.channel) {
      this.initialize();
    }
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${level}] [${component}] ${action}`;
    this.channel.appendLine(message);
    if (details) {
      this.channel.appendLine(JSON.stringify(details, null, 2));
    }
  }

  public static debug(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("DEBUG", component, action, details);
  }

  public static info(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("INFO", component, action, details);
  }

  public static warn(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("WARN", component, action, details);
  }

  public static error(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("ERROR", component, action, details);
  }
}
