import * as vscode from "vscode";

export class CodingStyleStatusBar {
  private static instance: CodingStyleStatusBar;
  private statusBarItem: vscode.StatusBarItem;
  private loadingInterval: NodeJS.Timeout | undefined;
  private readonly configSection = "epitech-coding-style";

  private constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.name = "Epitech Coding Style";
    this.statusBarItem.command = "epitech-coding-style.toggleMenu";
    this.updateStatus(0);
    this.statusBarItem.show();
  }

  public static getInstance(): CodingStyleStatusBar {
    if (!CodingStyleStatusBar.instance) {
      CodingStyleStatusBar.instance = new CodingStyleStatusBar();
    }
    return CodingStyleStatusBar.instance;
  }

  private startLoadingAnimation() {
    if (this.loadingInterval) {
      return;
    }

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

  public updateStatus(errorCount: number) {
    this.stopLoadingAnimation();
    const config = vscode.workspace.getConfiguration(this.configSection);
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
    this.stopLoadingAnimation();
    this.startLoadingAnimation();
  }

  public dispose() {
    this.stopLoadingAnimation();
    this.statusBarItem.dispose();
  }

  public registerCommand(
    context: vscode.ExtensionContext,
    command: () => Promise<void>
  ) {
    context.subscriptions.push(this.statusBarItem);
    this.statusBarItem.command = "epitech-coding-style.toggleMenu";
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "epitech-coding-style.toggleMenu",
        command
      )
    );
  }
}
