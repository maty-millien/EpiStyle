import * as vscode from "vscode";
import { Analyzer } from "./core/analyzer";
import { Diagnostics } from "./core/diagnostics";
import { Indicator } from "./core/indicator";
import { Settings } from "./core/settings";

/*

Extension Class Definition ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class Extension {
  private static settings: Settings;
  private static indicator: Indicator;
  private static analyzer: Analyzer;
  private static extensionContext: vscode.ExtensionContext;
  private static disposableAnalysisOnSave: vscode.Disposable | undefined;

  private static async toggleEnabledState() {
    const isEnabled = this.settings.isEnabled();
    await this.settings.setEnabled(!isEnabled);
  }

  /*

  Configuration Change Handler ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  private static onSettingsChange(enabled: boolean) {
    if (enabled) {
      Diagnostics.clearDiagnostics();
      void Promise.all(
        vscode.workspace.textDocuments.map((doc) => this.analyzeDocument(doc))
      ).then(() => {
        const totalErrors = Diagnostics.getTotalErrors();
        this.indicator.updateStatus(totalErrors);
      });
    } else {
      this.indicator.stopLoadingAnimation();
      this.indicator.updateStatus(0);
      Diagnostics.clearDiagnostics();
    }
  }

  /*

  Document Analysis Logic :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  private static async analyzeDocument(doc: vscode.TextDocument) {
    if (!this.settings.isEnabled()) return;

    Diagnostics.clearDiagnostics();

    this.indicator.startAnalysis();

    const errorCount = await this.analyzer.analyze(
      doc,
      this.extensionContext
    );
    if (errorCount >= 0) this.indicator.updateStatus(errorCount);
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
    this.settings = Settings.getInstance();
    this.indicator = Indicator.getInstance();
    this.analyzer = Analyzer.getInstance();

    this.indicator.registerCommand(context, () => this.toggleEnabledState());

    context.subscriptions.push(
      this.settings.registerSettingsChangeHandler((enabled) => {
        this.onSettingsChange(enabled);
        Extension.setupAnalysisOnSave(enabled);
      })
    );

    Extension.setupAnalysisOnSave(this.settings.isEnabled());
  }

  /*

  Extension Deactivation ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  public static deactivate(): void {
    this.indicator.dispose();
    Diagnostics.dispose();
    if (Extension.disposableAnalysisOnSave) Extension.disposableAnalysisOnSave.dispose();
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
