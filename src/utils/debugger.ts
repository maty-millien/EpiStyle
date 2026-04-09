import * as vscode from "vscode";
import { IDebugDetails } from "./types";

export class Debugger {
  private static channel: vscode.LogOutputChannel | null = null;

  private static getChannel(): vscode.LogOutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(
        "Epitech VS Coding Style Real-Time Checker",
        { log: true },
      );
    }
    return this.channel;
  }

  private static log(
    level: "INFO" | "WARN" | "ERROR",
    component: string,
    action: string,
    details?: IDebugDetails,
  ): void {
    const channel = this.getChannel();

    const message = `[${component}] ${action}`;
    switch (level) {
      case "ERROR":
        channel.error(message);
        break;
      case "WARN":
        channel.warn(message);
        break;
      case "INFO":
        channel.info(message);
        break;
    }

    if (details) {
      channel.appendLine(JSON.stringify(details, null, 2));
    }
  }

  public static info(
    component: string,
    action: string,
    details?: IDebugDetails,
  ): void {
    this.log("INFO", component, action, details);
  }

  public static warn(
    component: string,
    action: string,
    details?: IDebugDetails,
  ): void {
    this.log("WARN", component, action, details);
  }

  public static error(
    component: string,
    action: string,
    details?: IDebugDetails,
  ): void {
    this.log("ERROR", component, action, details);
  }
}
