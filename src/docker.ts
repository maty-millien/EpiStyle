import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import {
  CACHE_DURATION_MS,
  DOCKER_CACHE_KEY,
  DOCKER_IMAGE,
  TEMP_DIR,
  TEMP_REPORT_PATH,
} from "./constants";
import { debug } from "./debug";

async function pruneDockerImages(): Promise<void> {
  return new Promise((resolve, reject) => {
    debug.log("Docker", "Pruning unused images");
    exec("docker image prune -f", (error, stdout, stderr) => {
      if (error) {
        debug.log("Docker", "Prune failed", { error: stderr });
        console.warn("Failed to prune Docker images:", stderr);
      } else {
        debug.log("Docker", "Prune successful", { stdout });
      }
      resolve(); // Always resolve since prune failure is non-critical
    });
  });
}

async function pullDockerImage(
  context: vscode.ExtensionContext
): Promise<void> {
  const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) || 0;
  const now = Date.now();

  debug.log("Docker", "Checking image cache", {
    lastPull,
    now,
    timeSinceLastPull: now - lastPull,
  });

  if (now - lastPull < CACHE_DURATION_MS) {
    debug.log("Docker", "Using cached image");
    return;
  }

  debug.log("Docker", "Pulling new image");
  return new Promise((resolve, reject) => {
    const pullProcess = spawn("docker", ["pull", DOCKER_IMAGE], {
      shell: true,
    });

    pullProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      debug.log("Docker", "Pull progress", { output });
    });

    pullProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      debug.log("Docker", "Pull stderr", { output });
    });

    pullProcess.on("close", async (code) => {
      if (code !== 0) {
        debug.log("Docker", "Pull failed", { exitCode: code });
        reject(`Failed to pull Docker image with exit code: ${code}`);
      } else {
        debug.log("Docker", "Pull successful", { exitCode: code });
        context.globalState.update(DOCKER_CACHE_KEY, now);
        await pruneDockerImages();
        resolve();
      }
    });

    pullProcess.on("error", (error) => {
      debug.log("Docker", "Pull error", { error: error.message });
      reject(`Failed to pull Docker image: ${error.message}`);
    });
  });
}

export async function executeDockerCheck(
  filePath: string,
  context: vscode.ExtensionContext
): Promise<string> {
  debug.log("Docker", "Starting check", { filePath });

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath)
  );
  if (!workspaceFolder) {
    debug.log("Docker", "No workspace folder found");
    throw new Error("No workspace folder found");
  }

  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DIR)) {
    debug.log("Docker", "Creating temp directory");
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  try {
    await pullDockerImage(context);
  } catch (error) {
    debug.log("Docker", "Using cached image after pull failure", { error });
    console.warn("Failed to pull latest image, using cached version:", error);
  }

  const deliveryDir = workspaceFolder.uri.fsPath;

  debug.log("Docker", "Running container", {
    deliveryDir,
    reportPath: TEMP_REPORT_PATH,
  });

  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--rm",
      "-i",
      "-v",
      `${deliveryDir}:/mnt/delivery`,
      "-v",
      `${TEMP_DIR}:/mnt/reports`,
      DOCKER_IMAGE,
      "/mnt/delivery",
      "/mnt/reports",
    ];

    debug.log("Docker", "Spawning container", { args });

    const containerProcess = spawn("docker", args, { shell: true });

    containerProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      debug.log("Docker", "Container stdout", { output });
    });

    containerProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      debug.log("Docker", "Container stderr", { output });
    });

    containerProcess.on("close", (code) => {
      if (code !== 0) {
        debug.log("Docker", "Container execution failed", { exitCode: code });
        reject(`Docker container exited with code: ${code}`);
      } else {
        debug.log("Docker", "Container execution successful", {
          exitCode: code,
        });
        resolve(TEMP_REPORT_PATH);
      }
    });

    containerProcess.on("error", (error) => {
      debug.log("Docker", "Container execution error", {
        error: error.message,
      });
      reject(`Docker error: ${error.message}`);
    });
  });
}
