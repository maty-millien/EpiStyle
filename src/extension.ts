import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BANNED_EXTENSIONS, getLogPath } from "./constants";
import { Debugger } from "./debug";
import { Diagnostics } from "./diagnostics";
import { Docker } from "./docker";
import { Parser } from "./parser";

export class Extension {
  // Add flag to track if analysis is currently running
  private static isAnalysisRunning: boolean = false;
  private static readonly configSection = "epitech-coding-style";
  private static statusBarItem: vscode.StatusBarItem;
  private static loadingInterval: NodeJS.Timeout | undefined;
  private static extensionContext: vscode.ExtensionContext;

  private constructor() {}

  private static initializeStatusBar() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.name = "Epitech Coding Style";
    this.statusBarItem.command = "epitech-coding-style.toggleMenu";
    this.updateStatusBar(0);
    this.statusBarItem.show();
  }

  private static startLoadingAnimation() {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    this.statusBarItem.text = `$(loading~spin) Analyzing...`;
    this.loadingInterval = setInterval(() => {
      this.statusBarItem.text = `${frames[i]} Analyzing...`;
      i = (i + 1) % frames.length;
    }, 80); // Faster animation for smoother look
  }

  private static stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = undefined;
    }
  }

  private static updateStatusBar(errorCount: number) {
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

  private static isDocumentValid(doc: vscode.TextDocument): boolean {
    if (BANNED_EXTENSIONS.includes(doc.languageId)) {
      return false;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      Debugger.info("Extension", "No workspace folder found");
      return false;
    }

    return true;
  }

  private static async analyzeWorkspace(
    doc: vscode.TextDocument,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configSection);
    if (!config.get("enable")) {
      Debugger.info("Extension", "Extension disabled, clearing diagnostics");
      this.stopLoadingAnimation();
      this.updateStatusBar(0);
      Diagnostics.clearDiagnostics();
      return;
    }

    // If an analysis is already running, skip this run
    if (this.isAnalysisRunning) {
      Debugger.info(
        "Extension",
        "Analysis already running, skipping new analysis"
      );
      return;
    }

    this.isAnalysisRunning = true;
    this.startLoadingAnimation();

    try {
      let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;

      try {
        const config = vscode.workspace.getConfiguration(this.configSection);
        if (!config.get("enable")) {
          Debugger.info(
            "Extension",
            "Extension disabled, clearing diagnostics"
          );
          Diagnostics.clearDiagnostics();
          return;
        }

        if (!this.isDocumentValid(doc)) {
          return;
        }

        currentWorkspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)!;
        Diagnostics.clearDiagnostics();
        let reportPath = getLogPath(currentWorkspaceFolder.uri.fsPath);
        if (fs.existsSync(reportPath)) {
          Debugger.info("Extension", "Cleaning up old report file", {
            reportPath,
          });
          fs.unlinkSync(reportPath);
        }
        reportPath = await Docker.executeCheck(context, currentWorkspaceFolder);

        const fileErrorsMap = Parser.parseReport(
          reportPath,
          currentWorkspaceFolder.uri.fsPath
        );

        const totalErrors = Object.values(fileErrorsMap).reduce(
          (sum, errors) => sum + errors.length,
          0
        );

        Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
          const absolutePath = path.resolve(
            currentWorkspaceFolder!.uri.fsPath,
            filePath
          );
          const fileUri = vscode.Uri.file(absolutePath);
          Diagnostics.updateDiagnostics(fileUri, errors);
        });

        this.updateStatusBar(totalErrors);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Debugger.error("Extension", "Analysis failed", {
          error: errorMessage,
        });
        void vscode.window.showErrorMessage(
          `Failed to analyze workspace\n${errorMessage}`
        );
        this.updateStatusBar(0);
      }
    } finally {
      this.isAnalysisRunning = false;
    }
  }

  private static async showMenu() {
    const config = vscode.workspace.getConfiguration(this.configSection);
    const isEnabled = config.get<boolean>("enable") ?? true;

    const items = [
      {
        label: `${isEnabled ? "$(check) " : ""}Enable Coding Style Check`,
        description: isEnabled ? "Currently enabled" : "Currently disabled",
      },
      {
        label: `${!isEnabled ? "$(check) " : ""}Disable Coding Style Check`,
        description: !isEnabled ? "Currently disabled" : "Currently enabled",
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: "Epitech Coding Style Options",
    });

    if (selected) {
      const newValue = selected.label.includes("Enable");
      await config.update("enable", newValue, true);

      if (newValue) {
        // Re-run analysis on all open documents
        vscode.workspace.textDocuments.forEach(
          (doc) => void this.analyzeWorkspace(doc, this.extensionContext)
        );
      } else {
        // Cleanup when disabled
        this.stopLoadingAnimation();
        this.updateStatusBar(0);
        Diagnostics.clearDiagnostics();
      }
    }
  }

  public static activate(context: vscode.ExtensionContext): void {
    Debugger.info("Extension", "Activating extension");
    this.extensionContext = context;
    this.initializeStatusBar();

    context.subscriptions.push(
      this.statusBarItem,
      vscode.commands.registerCommand("epitech-coding-style.toggleMenu", () => {
        void this.showMenu();
      }),
      vscode.workspace.onDidSaveTextDocument(
        (doc) => void this.analyzeWorkspace(doc, context)
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${this.configSection}.enable`)) {
          const config = vscode.workspace.getConfiguration(this.configSection);
          if (!config.get("enable")) {
            this.stopLoadingAnimation();
            this.updateStatusBar(0);
            Diagnostics.clearDiagnostics();
          } else {
            vscode.workspace.textDocuments.forEach(
              (doc) => void this.analyzeWorkspace(doc, context)
            );
          }
        }
      })
    );

    Debugger.info("Extension", "Extension activated successfully");
  }

  public static deactivate(): void {
    Debugger.info("Extension", "Extension deactivated");
    this.stopLoadingAnimation();
    Diagnostics.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  Extension.activate(context);
}

export function deactivate(): void {
  Extension.deactivate();
}
