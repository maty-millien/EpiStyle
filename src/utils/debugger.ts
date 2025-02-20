import * as vscode from "vscode";
import { IDebugDetails } from "../config/types";

export class Debugger {
  private static channel: vscode.OutputChannel;
  private static readonly logLevels = ["INFO", "WARN", "ERROR"] as const;

  public static initialize(): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(
        "Epitech VS Coding Style",
        {
          log: true,
        }
      );
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

    const message = `[${component}] ${action}`;

    switch (level) {
      case "ERROR":
        (this.channel as vscode.LogOutputChannel).error(message);
        break;
      case "WARN":
        (this.channel as vscode.LogOutputChannel).warn(message);
        break;
      case "INFO":
        (this.channel as vscode.LogOutputChannel).info(message);
        break;
    }

    if (details) {
      this.channel.appendLine(JSON.stringify(details, null, 2));
    }
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
