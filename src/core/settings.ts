import * as vscode from "vscode";
import { CONFIG_SECTION } from "../utils/constants";

export class Settings {
  private static instance: Settings;

  public static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  public isEnabled(): boolean {
    return this.config.get<boolean>("enable") ?? true;
  }

  public shouldPersistLogFile(): boolean {
    return this.config.get<boolean>("persistLogFile") ?? false;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this.config.update(
      "enable",
      enabled,
      vscode.ConfigurationTarget.Global,
    );
  }

  public registerSettingsChangeHandler(
    handler: (enabled: boolean) => void,
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.enable`)) {
        handler(this.isEnabled());
      }
    });
  }
}
