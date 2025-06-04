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
} from "../config/constants";
import { Debugger } from "../utils/debugger";

const exec = promisify(execCallback);

/*

DockerError class definition :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

class DockerError extends Error {
  public constructor(message: string, public readonly exitCode?: number) {
    super(message);
    this.name = "DockerError";
  }
}

/*

Docker service class :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export class Docker {
  /*

  Prune unused Docker images :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  private static async pruneDockerImages(): Promise<void> {
    Debugger.info("Docker", "Pruning unused images");
    try {
      const { stdout, stderr } = await exec("docker image prune -f");
      if (stderr) {
        Debugger.warn("Docker", "Prune warnings", { stderr });
      } else {
        Debugger.info("Docker", "Prune successful", { stdout });
      }
    } catch (error: any) {
      Debugger.warn("Docker", "Prune failed", {
        error: error.message || error,
      });
    }
  }

  /*

  Pull Docker image with caching :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  private static async pullDockerImage(
    context: vscode.ExtensionContext
  ): Promise<void> {
    /*

    Check image cache validity :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
    const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) ?? 0;
    const now = Date.now();

    if (now - lastPull < CACHE_DURATION_MS) {
      Debugger.info("Docker", "Using cached image");
      return;
    }

    /*

    Execute docker pull command ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
    return new Promise<void>((resolve, reject) => {
      Debugger.info("Docker", "Pulling new image");
      const pullProcess = spawn("docker", ["pull", DOCKER_IMAGE], {
        shell: true,
      });
      let errorOutput = "";

      /*

      Handle pull process output :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

      */
      pullProcess.stdout.on("data", (data) => {
        Debugger.info("Docker", "Pull progress", {
          output: data.toString().trim(),
        });
      });

      pullProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        Debugger.info("Docker", "Pull stderr", {
          output: data.toString().trim(),
        });
      });

      /*

      Handle pull completion :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

      */
      pullProcess.on("close", async (code) => {
        if (code !== 0) {
          reject(
            new DockerError(
              `Failed to pull image: ${errorOutput}`,
              code ?? undefined
            )
          );
        } else {
          context.globalState.update(DOCKER_CACHE_KEY, now);
          await this.pruneDockerImages();
          resolve();
        }
      });

      pullProcess.on("error", (error) => {
        reject(new DockerError(`Failed to execute pull: ${error.message}`));
      });
    });
  }

  /*

  Execute coding style check :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

  */

  public static async executeCheck(
    context: vscode.ExtensionContext,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<string> {
    /*

    Validate workspace selection :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
    Debugger.info("Docker", "Starting workspace check", {
      workspaceFolder: workspaceFolder?.uri.fsPath,
    });

    const activeWorkspaceFolder =
      workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!activeWorkspaceFolder) {
      Debugger.info("Docker", "No workspace folder found");
      throw new Error("No workspace folder found");
    }

    /*

    Prepare log directory ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
    const workspacePath = activeWorkspaceFolder.uri.fsPath;
    const logDirPath = path.join(workspacePath, LOG_DIR);
    const reportPath = getLogPath(workspacePath);

    if (!fs.existsSync(logDirPath)) {
      Debugger.info("Docker", "Creating .vscode directory");
      fs.mkdirSync(logDirPath, { recursive: true });
    }

    /*

    Ensure Docker image exists :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
    try {
      await this.pullDockerImage(context);
    } catch (error) {
      Debugger.warn("Docker", "Using cached image after pull failure", {
        error,
      });
    }

    /*

    Run Docker container :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
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

      Debugger.info("Docker", "Running container", { args });
      const containerProcess = spawn("docker", args, {
        shell: true,
        windowsHide: true,
      });
      let errorOutput = "";

      /*

    Handle container output :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
      containerProcess.stdout.on("data", (data) => {
        Debugger.info("Docker", "Container stdout", {
          output: data.toString().trim(),
        });
      });

      containerProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        Debugger.info("Docker", "Container stderr", {
          output: data.toString().trim(),
        });
      });

      /*

    Handle container completion ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    */
      containerProcess.on("close", (code) => {
        if (code !== 0) {
          reject(
            new DockerError(
              `Container execution failed: ${errorOutput}`,
              code ?? undefined
            )
          );
        } else {
          resolve(reportPath);
        }
      });

      containerProcess.on("error", (error) => {
        reject(new DockerError(`Container execution error: ${error.message}`));
      });
    });
  }
}
