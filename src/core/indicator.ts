import * as vscode from "vscode";
import { CONFIG_SECTION, TOGGLE_COMMAND } from "../utils/constants";

export class Indicator {
  private static instance: Indicator;
  private indicatorItem: vscode.StatusBarItem;
  private loadingInterval: NodeJS.Timeout | undefined;


  private constructor() {
    this.indicatorItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.indicatorItem.name = "Epitech Coding Style Checker";
    this.indicatorItem.show();
  }


  public static getInstance(): Indicator {
    if (!Indicator.instance) Indicator.instance = new Indicator();
    return Indicator.instance;
  }


  public startLoadingAnimation() {
    if (this.loadingInterval) return;

    this.indicatorItem.backgroundColor = undefined;
    this.indicatorItem.color = undefined;
    this.indicatorItem.text = `$(loading~spin) Checking Coding Style`;
  }


  public stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = undefined;
    }
  }


  public updateStatus(errorCount: number, isEnabled?: boolean, message?: string) {
    this.stopLoadingAnimation();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const currentEnabledState = isEnabled !== undefined ? isEnabled : (config.get<boolean>("enable") ?? true);

    if (!currentEnabledState) {
      this.indicatorItem.text = message || `$(debug-disconnect) Coding Style Checker Off`;
      this.indicatorItem.backgroundColor = undefined;
      this.indicatorItem.color = undefined;
      return;
    }

    if (errorCount === 0) {
      this.indicatorItem.text = `$(check) No Coding Style Errors`;
      this.indicatorItem.backgroundColor = undefined;
      this.indicatorItem.color = undefined;
    } else {
      this.indicatorItem.text = `$(alert) ${errorCount} Coding Style Error${errorCount > 1 ? "s" : ""
        }`;
      this.indicatorItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      this.indicatorItem.color = new vscode.ThemeColor(
        "statusBarItem.warningForeground"
      );
    }
  }


  public dispose() {
    this.stopLoadingAnimation();
    this.indicatorItem.dispose();
  }


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
