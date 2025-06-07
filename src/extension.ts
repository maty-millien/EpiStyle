import * as vscode from "vscode";
import { Analyzer } from "./core/analyzer";
import { Diagnostics } from "./core/diagnostics";
import { Indicator } from "./core/indicator";
import { Settings } from "./core/settings";


export class Extension {
  private static settings: Settings;
  private static indicator: Indicator;
  private static analyzer: Analyzer;
  private static extensionContext: vscode.ExtensionContext;
  private static disposableAnalysisOnSave: vscode.Disposable | undefined;


  private static async toggleEnabledState() {
    const isEnabled = this.settings.isEnabled();

    if (isEnabled && Extension.disposableAnalysisOnSave) {
      Extension.disposableAnalysisOnSave.dispose();
      Extension.disposableAnalysisOnSave = undefined;
    }

    await this.settings.setEnabled(!isEnabled);
  }


  private static async onSettingsChange(enabled: boolean) {
    if (enabled) {
      let totalErrors = await this.analyzer.checkWorkspace(this.indicator, this.extensionContext, this.settings);
      this.indicator.updateStatus(totalErrors, enabled);
    } else {
      Diagnostics.clear();
      this.indicator.updateStatus(0, enabled);
    }
  }


  private static setupAnalysisOnSave(isEnabledNow: boolean): void {
    if (Extension.disposableAnalysisOnSave) {
      Extension.disposableAnalysisOnSave.dispose();
      Extension.disposableAnalysisOnSave = undefined;
    }

    if (isEnabledNow) {
      Extension.disposableAnalysisOnSave = vscode.workspace.onDidSaveTextDocument(
        () => void this.analyzer.checkWorkspace(this.indicator, this.extensionContext, this.settings)
      );
      this.extensionContext.subscriptions.push(Extension.disposableAnalysisOnSave);
    }
  }


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
    if (this.settings.isEnabled()) this.analyzer.checkWorkspace(this.indicator, this.extensionContext, this.settings);
  }


  public static deactivate(): void {
    this.indicator.dispose();
    Diagnostics.dispose();
    if (Extension.disposableAnalysisOnSave) Extension.disposableAnalysisOnSave.dispose();
  }
}


export function activate(context: vscode.ExtensionContext): void {
  Extension.activate(context);
}

export function deactivate(): void {
  Extension.deactivate();
}
