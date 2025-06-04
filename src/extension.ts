import * as vscode from "vscode";
import { Diagnostics } from "./core/diagnostics";
import { AnalyzerService } from "./services/analyzerService";
import { CodingStyleStatusBar } from "./ui/status-bar";
import { Debugger } from "./utils/debugger";
import { Settings } from "./utils/settings";

/*

Extension Class Definition ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class Extension {
  private static configManager: Settings;
  private static statusBar: CodingStyleStatusBar;
  private static analyzerService: AnalyzerService;
  private static extensionContext: vscode.ExtensionContext;

  /*

Menu Handling Logic :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static async showMenu() {
    const isEnabled = this.configManager.isEnabled();

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
      title: "Epitech Coding Style Real-Time Checker Options",
    });

    if (selected) {
      const newValue = selected.label.includes("Enable");
      await this.configManager.setEnabled(newValue);
    }
  }

  /*

Configuration Change Handler ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static onConfigurationChanged(enabled: boolean) {
    if (enabled)
      vscode.workspace.textDocuments.forEach(
        (doc) => void this.analyzeDocument(doc)
      );
    else {
      this.statusBar.stopLoadingAnimation();
      this.statusBar.updateStatus(0);
      Diagnostics.clearDiagnostics();
    }
  }

  /*

Document Analysis Logic :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static async analyzeDocument(doc: vscode.TextDocument) {
    if (!this.configManager.isEnabled()) return;

    this.statusBar.startAnalysis();
    const errorCount = await this.analyzerService.analyze(
      doc,
      this.extensionContext
    );
    if (errorCount >= 0) this.statusBar.updateStatus(errorCount);
  }

  /*

Extension Activation ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static activate(context: vscode.ExtensionContext): void {
    Debugger.info("Extension", "Activating extension");
    this.extensionContext = context;

    this.configManager = Settings.getInstance();
    this.statusBar = CodingStyleStatusBar.getInstance();
    this.analyzerService = AnalyzerService.getInstance();

    this.statusBar.registerCommand(context, () => this.showMenu());

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(
        (doc) => void this.analyzeDocument(doc)
      ),
      this.configManager.registerConfigurationChangeHandler((enabled) =>
        this.onConfigurationChanged(enabled)
      )
    );

    Debugger.info("Extension", "Extension activated successfully");
  }

  /*

Extension Deactivation ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static deactivate(): void {
    Debugger.info("Extension", "Extension deactivated");
    this.statusBar.dispose();
    Diagnostics.dispose();
  }
}

/*

Entry Points ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export function activate(context: vscode.ExtensionContext): void {
  Extension.activate(context);
}

export function deactivate(): void {
  Extension.deactivate();
}
