import * as vscode from "vscode";
import { IDebugDetails } from "./types";

/*

Debugger class definition and static channel initialization :::::::::::::::::::::::::::::::::::::::::

*/

export class Debugger {
  private static channel: vscode.LogOutputChannel | null = null;

  /*

Output channel initialization method :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static initialize(): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(
        "Epitech VS Coding Style Real-Time Checker",
        { log: true }
      );
    }
  }

  /*

Core logging method handling different log levels ::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static log(
    level: "INFO" | "WARN" | "ERROR",
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    if (!this.channel) this.initialize();
    const channel = this.channel!;

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

    if (details) channel.appendLine(JSON.stringify(details, null, 2));
  }

  /*

Public method for info level logging ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static info(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("INFO", component, action, details);
  }

  /*

Public method for warn level logging ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static warn(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("WARN", component, action, details);
  }

  /*

Public method for error level logging :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static error(
    component: string,
    action: string,
    details?: IDebugDetails
  ): void {
    this.log("ERROR", component, action, details);
  }
}
