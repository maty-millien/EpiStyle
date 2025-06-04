import * as vscode from "vscode";
import { CONFIG_SECTION } from "./constants";
import { Debugger } from "./debugger";

export class Settings {
  private static instance: Settings;
  private _config: vscode.WorkspaceConfiguration;

  /*

  Comment : Initializes the Settings class and handles instance creation.::::::::::::::::::::::::::::::

  */

  private constructor() {
    this._config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  public static getInstance(): Settings {
    if (!Settings.instance)
      Settings.instance = new Settings();
    return Settings.instance;
  }

  /*

  Comment : Checks if the extension is currently enabled in user settings.::::::::::::::::::::::::::::::::::

  */

  public isEnabled(): boolean {
    return this._config.get<boolean>("enable") ?? true;
  }

  /*

  Comment : Updates the extension's enabled state in user settings.::::::::::::::::::::::::::::::::::::::::::

  */

  public async setEnabled(enabled: boolean): Promise<void> {
    await this._config.update("enable", enabled, true);
    Debugger.info(
      "ConfigurationManager",
      `Extension ${enabled ? "enabled" : "disabled"}`
    );
  }

  /*

  Comment : Registers a handler for changes to the 'enable' configuration setting.::::::::::::::::::::::::

  */

  public registerConfigurationChangeHandler(
    handler: (enabled: boolean) => void
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.enable`))
        handler(this.isEnabled());
    });
  }
}
