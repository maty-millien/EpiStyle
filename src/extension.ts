import * as vscode from "vscode";
import { AnalyzerService } from "./core/analyzer";
import { Diagnostics } from "./core/diagnostics";
import { StatusBarIndicator } from "./core/indicator";
import { Settings } from "./core/settings";

/*

Extension Class Definition ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class Extension {
  private static configManager: Settings;
  private static statusBar: StatusBarIndicator;
  private static analyzerService: AnalyzerService;
  private static extensionContext: vscode.ExtensionContext;
  private static disposableAnalysisOnSave: vscode.Disposable | undefined;

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
    if (enabled) {
      Diagnostics.clearDiagnostics();
      void Promise.all(
        vscode.workspace.textDocuments.map((doc) => this.analyzeDocument(doc))
      ).then(() => {
        const totalErrors = Diagnostics.getTotalErrors();
        this.statusBar.updateStatus(totalErrors);
      });
    } else {
      this.statusBar.stopLoadingAnimation();
      this.statusBar.updateStatus(0);
      Diagnostics.clearDiagnostics();
    }
  }

  /*

Document Analysis Logic :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  private static async analyzeDocument(doc: vscode.TextDocument) {
    if (!this.configManager.isEnabled()) {
      return;
    }

    Diagnostics.updateDiagnostics(doc.uri, []);

    this.statusBar.startAnalysis();
    const errorCount = await this.analyzerService.analyze(
      doc,
      this.extensionContext
    );
    if (errorCount >= 0) this.statusBar.updateStatus(errorCount);
  }

  /*

  Sets up or disposes the listener for document save events based on extension's enabled state.:::

  */

  private static setupAnalysisOnSave(isEnabledNow: boolean): void {
    if (Extension.disposableAnalysisOnSave) {
      Extension.disposableAnalysisOnSave.dispose();
      Extension.disposableAnalysisOnSave = undefined;
    }

    if (isEnabledNow) {
      Extension.disposableAnalysisOnSave = vscode.workspace.onDidSaveTextDocument(
        (doc) => void this.analyzeDocument(doc)
      );
      this.extensionContext.subscriptions.push(Extension.disposableAnalysisOnSave);
    }
  }

  /*

Extension Activation ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static activate(context: vscode.ExtensionContext): void {
    this.extensionContext = context;

    this.configManager = Settings.getInstance();
    this.statusBar = StatusBarIndicator.getInstance();
    this.analyzerService = AnalyzerService.getInstance();

    this.statusBar.registerCommand(context, () => this.showMenu());

    context.subscriptions.push(
      this.configManager.registerConfigurationChangeHandler((enabled) => {
        this.onConfigurationChanged(enabled);
        Extension.setupAnalysisOnSave(enabled);
      })
    );

    Extension.setupAnalysisOnSave(this.configManager.isEnabled());
  }

  /*

Extension Deactivation ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

  public static deactivate(): void {
    this.statusBar.dispose();
    Diagnostics.dispose();
    if (Extension.disposableAnalysisOnSave) {
      Extension.disposableAnalysisOnSave.dispose();
    }
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
