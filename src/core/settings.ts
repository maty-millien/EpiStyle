import * as vscode from "vscode";
import { CONFIG_SECTION } from "../utils/constants";

export class Settings {
  private static instance: Settings;
  private _config: vscode.WorkspaceConfiguration;

  private constructor() {
    this._config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  public static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  public isEnabled(): boolean {
    this._config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return this._config.get<boolean>("enable") ?? true;
  }

  public shouldPersistLogFile(): boolean {
    this._config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return this._config.get<boolean>("persistLogFile") ?? false;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this._config.update("enable", enabled, true);
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
