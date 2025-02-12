import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  CACHE_DURATION_MS,
  DOCKER_CACHE_KEY,
  DOCKER_IMAGE,
  LOG_DIR,
  getLogPath,
} from "./constants";
import { DebugLogger } from "./debug";

class DockerError extends Error {
  public constructor(message: string, public readonly exitCode?: number) {
    super(message);
    this.name = "DockerError";
  }
}

export class DockerService {
  private static async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static async pruneDockerImages(): Promise<void> {
    return new Promise<void>((resolve) => {
      DebugLogger.info("Docker", "Pruning unused images");
      exec("docker image prune -f", (error, stdout, stderr) => {
        if (error) {
          DebugLogger.warn("Docker", "Prune failed", { error: stderr });
        } else {
          DebugLogger.debug("Docker", "Prune successful", { stdout });
        }
        resolve();
      });
    });
  }

  private static async pullDockerImage(
    context: vscode.ExtensionContext
  ): Promise<void> {
    const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) || 0;
    const now = Date.now();

    if (now - lastPull < CACHE_DURATION_MS) {
      DebugLogger.debug("Docker", "Using cached image");
      return;
    }

    return new Promise<void>((resolve, reject) => {
      DebugLogger.info("Docker", "Pulling new image");
      const pullProcess = spawn("docker", ["pull", DOCKER_IMAGE], {
        shell: true,
      });
      let errorOutput = "";

      pullProcess.stdout.on("data", (data) => {
        DebugLogger.debug("Docker", "Pull progress", {
          output: data.toString().trim(),
        });
      });

      pullProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        DebugLogger.debug("Docker", "Pull stderr", {
          output: data.toString().trim(),
        });
      });

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

  public static async executeCheck(
    filePath: string,
    context: vscode.ExtensionContext
  ): Promise<string> {
    DebugLogger.info("Docker", "Starting check", { filePath });

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(filePath)
    );
    if (!workspaceFolder) {
      DebugLogger.debug("Docker", "No workspace folder found");
      throw new Error("No workspace folder found");
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const logDirPath = path.join(workspacePath, LOG_DIR);
    const reportPath = getLogPath(workspacePath);

    // Ensure .vscode directory exists
    if (!fs.existsSync(logDirPath)) {
      DebugLogger.debug("Docker", "Creating .vscode directory");
      fs.mkdirSync(logDirPath, { recursive: true });
    }

    try {
      await this.pullDockerImage(context);
    } catch (error) {
      DebugLogger.warn("Docker", "Using cached image after pull failure", {
        error,
      });
    }

    return new Promise<string>((resolve, reject) => {
      const args = [
        "run",
        "--rm",
        "-i",
        "-v",
        `${workspacePath}:/mnt/delivery`,
        "-v",
        `${path.dirname(reportPath)}:/mnt/reports`,
        DOCKER_IMAGE,
        "/mnt/delivery",
        "/mnt/reports",
      ];

      DebugLogger.debug("Docker", "Running container", { args });
      const containerProcess = spawn("docker", args, { shell: true });
      let errorOutput = "";

      containerProcess.stdout.on("data", (data) => {
        DebugLogger.debug("Docker", "Container stdout", {
          output: data.toString().trim(),
        });
      });

      containerProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        DebugLogger.debug("Docker", "Container stderr", {
          output: data.toString().trim(),
        });
      });

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
