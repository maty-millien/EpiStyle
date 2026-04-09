import * as vscode from "vscode";
import { TOGGLE_COMMAND } from "../utils/constants";

export class Indicator {
  private static instance: Indicator;
  private indicatorItem: vscode.StatusBarItem;

  private constructor() {
    this.indicatorItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.indicatorItem.name = "EpiStyle";
    this.indicatorItem.command = TOGGLE_COMMAND;
    this.indicatorItem.show();
  }

  public static getInstance(): Indicator {
    if (!Indicator.instance) {
      Indicator.instance = new Indicator();
    }
    return Indicator.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.indicatorItem);
  }

  public registerToggleCommand(
    context: vscode.ExtensionContext,
    handler: () => Promise<void>,
  ): void {
    context.subscriptions.push(
      vscode.commands.registerCommand(TOGGLE_COMMAND, handler),
    );
  }

  public startLoadingAnimation(): void {
    this.indicatorItem.backgroundColor = undefined;
    this.indicatorItem.color = undefined;
    this.indicatorItem.text = `$(loading~spin) EpiStyle: Checking`;
  }

  public updateStatus(
    errorCount: number,
    isEnabled: boolean,
    message?: string,
  ): void {
    if (!isEnabled) {
      this.indicatorItem.text = message ?? `$(debug-disconnect) EpiStyle: Off`;
      this.indicatorItem.backgroundColor = undefined;
      this.indicatorItem.color = undefined;
      return;
    }

    if (errorCount === 0) {
      this.indicatorItem.text = `$(check) EpiStyle: Clean`;
      this.indicatorItem.backgroundColor = undefined;
      this.indicatorItem.color = undefined;
      return;
    }

    this.indicatorItem.text = `$(alert) EpiStyle: ${errorCount} Warning${
      errorCount > 1 ? "s" : ""
    }`;
    this.indicatorItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    this.indicatorItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
  }

  public dispose(): void {
    this.indicatorItem.dispose();
  }
}
