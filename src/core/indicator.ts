import * as vscode from "vscode";
import { CONFIG_SECTION, TOGGLE_COMMAND } from "../utils/constants";

/*

Class Definition :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class StatusBarIndicator {
  private static instance: StatusBarIndicator;
  private statusBarItem: vscode.StatusBarItem;
  private loadingInterval: NodeJS.Timeout | undefined;

  /*

Initialization ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.name = "Epitech Coding Style Real-Time Checker";
    this.updateStatus(0);
    this.statusBarItem.show();
  }

  /*

Singleton Access :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static getInstance(): StatusBarIndicator {
    if (!StatusBarIndicator.instance)
      StatusBarIndicator.instance = new StatusBarIndicator();
    return StatusBarIndicator.instance;
  }

  /*

Animation Control :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private startLoadingAnimation() {
    if (this.loadingInterval) return;

    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    this.statusBarItem.text = `$(loading~spin)  Analyzing...`;
    this.loadingInterval = setInterval(() => {
      this.statusBarItem.text = `${frames[i]}  Analyzing...`;
      i = (i + 1) % frames.length;
    }, 80);
  }

  public stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = undefined;
    }
  }

  /*

Status Display :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public updateStatus(errorCount: number) {
    this.stopLoadingAnimation();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const isEnabled = config.get<boolean>("enable") ?? true;

    if (!isEnabled) {
      this.statusBarItem.text = `$(debug-disconnect) Disabled`;
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    if (errorCount === 0) {
      this.statusBarItem.text = `$(check) No Coding Style Errors`;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(alert) ${errorCount} Coding Style Error${
        errorCount > 1 ? "s" : ""
      }`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
  }

  public startAnalysis() {
    this.startLoadingAnimation();
  }

  /*

Resource Management ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public dispose() {
    this.stopLoadingAnimation();
    this.statusBarItem.dispose();
  }

  /*

Command Handling :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public registerCommand(
    context: vscode.ExtensionContext,
    command: () => Promise<void>
  ) {
    context.subscriptions.push(this.statusBarItem);
    this.statusBarItem.command = TOGGLE_COMMAND;
    context.subscriptions.push(
      vscode.commands.registerCommand(TOGGLE_COMMAND, command)
    );
  }
}
