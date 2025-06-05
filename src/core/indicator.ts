import * as vscode from "vscode";
import { CONFIG_SECTION, TOGGLE_COMMAND } from "../utils/constants";

/*

Class Definition :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class Indicator {
  private static instance: Indicator;
  private indicatorItem: vscode.StatusBarItem;
  private loadingInterval: NodeJS.Timeout | undefined;

  /*

Initialization ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private constructor() {
    this.indicatorItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.indicatorItem.name = "Epitech Coding Style Real-Time Checker";
    this.updateStatus(0);
    this.indicatorItem.show();
  }

  /*

Singleton Access :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static getInstance(): Indicator {
    if (!Indicator.instance)
      Indicator.instance = new Indicator();
    return Indicator.instance;
  }

  /*

Animation Control :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private startLoadingAnimation() {
    if (this.loadingInterval) return;

    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    this.indicatorItem.text = `$(loading~spin)  Analyzing...`;
    this.loadingInterval = setInterval(() => {
      this.indicatorItem.text = `${frames[i]}  Analyzing...`;
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
      this.indicatorItem.text = `$(debug-disconnect) Disabled`;
      this.indicatorItem.backgroundColor = undefined;
      return;
    }

    if (errorCount === 0) {
      this.indicatorItem.text = `$(check) No Coding Style Errors`;
      this.indicatorItem.backgroundColor = undefined;
    } else {
      this.indicatorItem.text = `$(alert) ${errorCount} Coding Style Error${
        errorCount > 1 ? "s" : ""
      }`;
      this.indicatorItem.backgroundColor = new vscode.ThemeColor(
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
    this.indicatorItem.dispose();
  }

  /*

Command Handling :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public registerCommand(
    context: vscode.ExtensionContext,
    command: () => Promise<void>
  ) {
    context.subscriptions.push(this.indicatorItem);
    this.indicatorItem.command = TOGGLE_COMMAND;
    context.subscriptions.push(
      vscode.commands.registerCommand(TOGGLE_COMMAND, command)
    );
  }
}
