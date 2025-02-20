import * as vscode from "vscode";
import { Debugger } from "../utils/debugger";

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private static readonly CONFIG_SECTION = "epitech-coding-style";

  private constructor() {}

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  public isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(
      ConfigurationManager.CONFIG_SECTION
    );
    return config.get<boolean>("enable") ?? true;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ConfigurationManager.CONFIG_SECTION
    );
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
      if (
        event.affectsConfiguration(
          `${ConfigurationManager.CONFIG_SECTION}.enable`
        )
      ) {
        handler(this.isEnabled());
      }
    });
  }
}
