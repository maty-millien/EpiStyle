import { exec as execCallback, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import {
  CACHE_DURATION_MS,
  DELIVERY_MOUNT_DIR,
  DOCKER_CACHE_KEY,
  DOCKER_IMAGE,
  LOG_DIR,
  REPORT_MOUNT_DIR,
  getLogPath,
} from "../utils/constants";
import { Debugger } from "../utils/debugger";

const exec = promisify(execCallback);

export class Docker {
  private static async pruneDockerImages(): Promise<void> {
    try {
      await exec("docker image prune -f");
    } catch (error: any) {
      Debugger.error("Docker", "Prune failed", {
        error: error.message || error,
      });
    }
  }

  private static async pullDockerImage(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) ?? 0;
    const now = Date.now();

    if (now - lastPull < CACHE_DURATION_MS) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const pullProcess = spawn("docker", ["pull", DOCKER_IMAGE], {
        shell: true,
      });
      let errorOutput = "";

      pullProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      pullProcess.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to pull image: ${errorOutput}`));
        } else {
          context.globalState.update(DOCKER_CACHE_KEY, now);
          await this.pruneDockerImages();
          resolve();
        }
      });

      pullProcess.on("error", (error) => {
        reject(new Error(`Failed to execute pull: ${error.message}`));
      });
    });
  }

  public static async executeCheck(
    context: vscode.ExtensionContext,
    workspaceFolder?: vscode.WorkspaceFolder,
  ): Promise<string> {
    const activeWorkspaceFolder =
      workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!activeWorkspaceFolder) {
      throw new Error("No workspace folder found");
    }

    const workspacePath = activeWorkspaceFolder.uri.fsPath;
    const logDirPath = path.join(workspacePath, LOG_DIR);
    const reportPath = getLogPath(workspacePath);

    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true });
    }

    try {
      await this.pullDockerImage(context);
    } catch (error: any) {
      Debugger.error("Docker", "Pull failed", {
        error: error.message || error,
      });
    }

    return new Promise<string>((resolve, reject) => {
      const escapedWorkspacePath = `"${workspacePath.replace(/"/g, '\\"')}"`;
      const escapedReportPath = `"${path
        .dirname(reportPath)
        .replace(/"/g, '\\"')}"`;

      const args = [
        "run",
        "--rm",
        "-i",
        "-v",
        `${escapedWorkspacePath}:${DELIVERY_MOUNT_DIR}`,
        "-v",
        `${escapedReportPath}:${REPORT_MOUNT_DIR}`,
        DOCKER_IMAGE,
        DELIVERY_MOUNT_DIR,
        REPORT_MOUNT_DIR,
      ];

      const containerProcess = spawn("docker", args, {
        shell: true,
        windowsHide: true,
      });
      let errorOutput = "";

      containerProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      containerProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Container execution failed: ${errorOutput}`));
        }
        resolve(reportPath);
      });

      containerProcess.on("error", (error) => {
        reject(new Error(`Container execution error: ${error.message}`));
      });
    });
  }
}
