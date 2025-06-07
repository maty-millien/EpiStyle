import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getLogPath } from "../utils/constants";
import { hasCFile } from "../utils/search";
import { IErrorCode } from "../utils/types";
import { Diagnostics } from "./diagnostics";
import { Docker } from "./docker";
import { Indicator } from "./indicator";
import { Parser } from "./parser";
import { Settings } from "./settings";


export class Analyzer {
  private static instance: Analyzer;
  private isAnalysisRunning: boolean = false;


  public static getInstance(): Analyzer {
    if (!Analyzer.instance)
      Analyzer.instance = new Analyzer();
    return Analyzer.instance;
  }


  public async checkWorkspace(
    indicator: Indicator,
    context: vscode.ExtensionContext,
    settings: Settings
  ): Promise<number> {

    if (this.isAnalysisRunning || !settings.isEnabled()) return 0;

    this.isAnalysisRunning = true;
    indicator.startLoadingAnimation();

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      let totalErrors = 0;

      Diagnostics.clear();

      let foundCFile = false;
      for (const workspaceFolder of workspaceFolders) {
        if (await hasCFile(workspaceFolder.uri.fsPath)) {
          foundCFile = true;
          break;
        }
      }

      if (!foundCFile) {
        await settings.setEnabled(false);
        indicator.updateStatus(0, false, "$(error) Not a C/C++ Project");
        return 0;
      }

      for (const workspaceFolder of workspaceFolders) {
        const projectRoot = workspaceFolder.uri.fsPath;

        const reportPath = getLogPath(projectRoot);
        if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

        const newReportPath = await Docker.executeCheck(context, workspaceFolder);
        const fileErrorsMap = Parser.parseReport(newReportPath, projectRoot);

        totalErrors += Object.values(fileErrorsMap).reduce(
          (sum, errors: IErrorCode[]) => sum + errors.length,
          0
        );

        Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
          const absolutePath = path.resolve(projectRoot, filePath);
          const fileUri = vscode.Uri.file(absolutePath);
          Diagnostics.update(fileUri, errors);
        });
      }
      indicator.updateStatus(totalErrors, true);
      return totalErrors;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to analyze workspace\n${error}`);
      indicator.updateStatus(0, settings.isEnabled());
      return 0;
    } finally {
      this.isAnalysisRunning = false;
    }
  }
}
