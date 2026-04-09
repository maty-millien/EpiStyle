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
  private isAnalysisRunning = false;
  private pendingRerun = false;

  public static getInstance(): Analyzer {
    if (!Analyzer.instance) {
      Analyzer.instance = new Analyzer();
    }
    return Analyzer.instance;
  }

  public async checkWorkspace(
    context: vscode.ExtensionContext,
  ): Promise<number> {
    const indicator = Indicator.getInstance();
    const settings = Settings.getInstance();

    if (!settings.isEnabled()) {
      return 0;
    }

    if (this.isAnalysisRunning) {
      this.pendingRerun = true;
      return 0;
    }

    this.isAnalysisRunning = true;
    indicator.startLoadingAnimation();

    const bailIfDisabled = (): boolean => {
      if (settings.isEnabled()) {
        return false;
      }
      Diagnostics.clear();
      indicator.updateStatus(0, false);
      return true;
    };

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      let totalErrors = 0;

      Diagnostics.clear();

      let foundCFile = false;
      for (const workspaceFolder of workspaceFolders) {
        if (await hasCFile(workspaceFolder.uri.fsPath)) {
          foundCFile = true;
          break;
        }
      }

      if (bailIfDisabled()) {
        return 0;
      }

      if (!foundCFile) {
        await settings.setEnabled(false);
        indicator.updateStatus(0, false, "$(error) Not a C Project");
        return 0;
      }

      for (const workspaceFolder of workspaceFolders) {
        const projectRoot = workspaceFolder.uri.fsPath;

        const reportPath = getLogPath(projectRoot);
        if (fs.existsSync(reportPath)) {
          fs.unlinkSync(reportPath);
        }

        const newReportPath = await Docker.getInstance().executeCheck(
          context,
          workspaceFolder,
        );

        if (bailIfDisabled()) {
          return 0;
        }

        const fileErrorsMap = Parser.parseReport(
          newReportPath,
          projectRoot,
          settings.getExcludePaths(),
        );

        if (!settings.shouldPersistLogFile() && fs.existsSync(newReportPath)) {
          fs.unlinkSync(newReportPath);
        }

        totalErrors += Object.values(fileErrorsMap).reduce(
          (sum, errors: IErrorCode[]) => sum + errors.length,
          0,
        );

        Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
          const absolutePath = path.resolve(projectRoot, filePath);
          const fileUri = vscode.Uri.file(absolutePath);
          Diagnostics.update(fileUri, errors);
        });
      }

      if (bailIfDisabled()) {
        return 0;
      }

      indicator.updateStatus(totalErrors, true);
      return totalErrors;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to analyze workspace\n${error}`);
      indicator.updateStatus(0, settings.isEnabled());
      return 0;
    } finally {
      this.isAnalysisRunning = false;
      if (this.pendingRerun) {
        this.pendingRerun = false;
        void this.checkWorkspace(context);
      }
    }
  }
}
