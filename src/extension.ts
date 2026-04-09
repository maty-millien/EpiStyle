import * as vscode from "vscode";
import { Analyzer } from "./core/analyzer";
import { Diagnostics } from "./core/diagnostics";
import { Indicator } from "./core/indicator";
import { Settings } from "./core/settings";

let saveDisposable: vscode.Disposable | undefined;

function setupAnalysisOnSave(
  context: vscode.ExtensionContext,
  isEnabled: boolean,
): void {
  if (saveDisposable) {
    saveDisposable.dispose();
    saveDisposable = undefined;
  }

  if (!isEnabled) {
    return;
  }

  const analyzer = Analyzer.getInstance();
  saveDisposable = vscode.workspace.onDidSaveTextDocument(() => {
    void analyzer.checkWorkspace(context);
  });
}

async function toggleEnabledState(): Promise<void> {
  const settings = Settings.getInstance();
  await settings.setEnabled(!settings.isEnabled());
}

export function activate(context: vscode.ExtensionContext): void {
  const settings = Settings.getInstance();
  const indicator = Indicator.getInstance();
  const analyzer = Analyzer.getInstance();

  Diagnostics.init(context);
  indicator.register(context);
  indicator.registerToggleCommand(context, toggleEnabledState);

  context.subscriptions.push(
    settings.registerSettingsChangeHandler((enabled) => {
      setupAnalysisOnSave(context, enabled);
      if (enabled) {
        void analyzer.checkWorkspace(context);
      } else {
        Diagnostics.clear();
        indicator.updateStatus(0, false);
      }
    }),
  );

  setupAnalysisOnSave(context, settings.isEnabled());
  if (settings.isEnabled()) {
    void analyzer.checkWorkspace(context);
  }
}

export function deactivate(): void {
  Indicator.getInstance().dispose();
  if (saveDisposable) {
    saveDisposable.dispose();
    saveDisposable = undefined;
  }
}
