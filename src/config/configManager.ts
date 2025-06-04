import * as vscode from "vscode";
import { Debugger } from "../utils/debugger";
import { CONFIG_SECTION } from "./constants";

export class ConfigManager {
  private static instance: ConfigManager;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<boolean>("enable") ?? true;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update("enable", enabled, true);
    Debugger.info(
      "ConfigurationManager",
      `Extension ${enabled ? "enabled" : "disabled"}`
    );
  }

  public registerConfigurationChangeHandler(
    handler: (enabled: boolean) => void
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.enable`)) {
        handler(this.isEnabled());
      }
    });
  }
}
