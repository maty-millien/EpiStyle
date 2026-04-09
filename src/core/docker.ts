import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  CACHE_DURATION_MS,
  DELIVERY_MOUNT_DIR,
  DOCKER_CACHE_KEY,
  DOCKER_IMAGE,
  DOCKER_PULL_TIMEOUT_MS,
  DOCKER_RUN_TIMEOUT_MS,
  LOG_DIR,
  REPORT_MOUNT_DIR,
  getLogPath,
} from "../utils/constants";
import { Debugger } from "../utils/debugger";

function runDocker(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`docker ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`docker ${args[0]} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`docker ${args[0]} exited ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

export class Docker {
  private static async pullDockerImage(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) ?? 0;
    const now = Date.now();

    if (now - lastPull < CACHE_DURATION_MS) {
      return;
    }

    await runDocker(["pull", DOCKER_IMAGE], DOCKER_PULL_TIMEOUT_MS);
    await context.globalState.update(DOCKER_CACHE_KEY, now);
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

    await runDocker(
      [
        "run",
        "--rm",
        "-i",
        "-v",
        `${workspacePath}:${DELIVERY_MOUNT_DIR}`,
        "-v",
        `${path.dirname(reportPath)}:${REPORT_MOUNT_DIR}`,
        DOCKER_IMAGE,
        DELIVERY_MOUNT_DIR,
        REPORT_MOUNT_DIR,
      ],
      DOCKER_RUN_TIMEOUT_MS,
    );

    return reportPath;
  }
}
