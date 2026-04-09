import { spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  CACHE_DURATION_MS,
  CONTAINER_NAME_PREFIX,
  DELIVERY_MOUNT_DIR,
  DOCKER_CACHE_KEY,
  DOCKER_EXEC_TIMEOUT_MS,
  DOCKER_IMAGE,
  DOCKER_INSPECT_TIMEOUT_MS,
  DOCKER_PREFLIGHT_TIMEOUT_MS,
  DOCKER_PULL_TIMEOUT_MS,
  DOCKER_START_TIMEOUT_MS,
  DOCKER_STOP_TIMEOUT_MS,
  LOG_DIR,
  REPORT_MOUNT_DIR,
  getLogPath,
} from "../utils/constants";
import { Debugger } from "../utils/debugger";

interface DockerResult {
  stdout: string;
  stderr: string;
}

function runDocker(args: string[], timeoutMs: number): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
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
      resolve({ stdout, stderr });
    });
  });
}

interface ContainerHandle {
  name: string;
  workspacePath: string;
}

export type DockerUnavailableReason = "cli-missing" | "daemon-down" | "other";

export class DockerUnavailableError extends Error {
  public readonly reason: DockerUnavailableReason;

  constructor(reason: DockerUnavailableReason, message: string) {
    super(message);
    this.name = "DockerUnavailableError";
    this.reason = reason;
  }
}

function classifyPreflightError(rawMessage: string): DockerUnavailableReason {
  const message = rawMessage.toLowerCase();
  if (
    message.includes("enoent") ||
    message.includes("failed to start") ||
    message.includes("command not found")
  ) {
    return "cli-missing";
  }
  if (
    message.includes("cannot connect to the docker daemon") ||
    message.includes("is the docker daemon running") ||
    message.includes("docker desktop is not running") ||
    message.includes("error during connect") ||
    message.includes("the system cannot find the file specified")
  ) {
    return "daemon-down";
  }
  return "other";
}

export class Docker {
  private static instance: Docker;

  private containers = new Map<string, ContainerHandle>();
  private entrypointCmd: string[] | null = null;
  private available = false;
  private initPromise: Promise<void> | null = null;

  public static getInstance(): Docker {
    if (!Docker.instance) {
      Docker.instance = new Docker();
    }
    return Docker.instance;
  }

  public isAvailable(): boolean {
    return this.available;
  }

  public async init(context: vscode.ExtensionContext): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.runInit(context).catch((error) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  public async waitForReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async runInit(context: vscode.ExtensionContext): Promise<void> {
    try {
      await runDocker(
        ["version", "--format", "{{.Server.Version}}"],
        DOCKER_PREFLIGHT_TIMEOUT_MS,
      );
    } catch (error: any) {
      this.available = false;
      const rawMessage = error?.message ?? String(error);
      const reason = classifyPreflightError(rawMessage);
      Debugger.error("Docker", "Preflight failed", {
        reason,
        error: rawMessage,
      });
      const friendly =
        reason === "cli-missing"
          ? "Docker command not found."
          : reason === "daemon-down"
            ? "Docker is not running."
            : `Docker preflight failed: ${rawMessage}`;
      throw new DockerUnavailableError(reason, friendly);
    }

    this.available = true;

    try {
      await this.pullImage(context);
    } catch (error: any) {
      Debugger.warn("Docker", "Pull failed, continuing with cached image", {
        error: error.message || String(error),
      });
    }

    try {
      this.entrypointCmd = await this.discoverEntrypoint();
    } catch (error: any) {
      this.available = false;
      Debugger.error("Docker", "Failed to discover image entrypoint", {
        error: error.message || String(error),
      });
      throw new DockerUnavailableError(
        "other",
        `Could not inspect ${DOCKER_IMAGE}. The image may not be pulled yet.`,
      );
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    await Promise.all(folders.map((folder) => this.startContainer(folder)));
  }

  private async pullImage(context: vscode.ExtensionContext): Promise<void> {
    const lastPull = context.globalState.get<number>(DOCKER_CACHE_KEY) ?? 0;
    const now = Date.now();

    if (now - lastPull < CACHE_DURATION_MS) {
      return;
    }

    await runDocker(["pull", DOCKER_IMAGE], DOCKER_PULL_TIMEOUT_MS);
    await context.globalState.update(DOCKER_CACHE_KEY, now);
  }

  private async discoverEntrypoint(): Promise<string[]> {
    const { stdout } = await runDocker(
      [
        "image",
        "inspect",
        "--format",
        "{{json .Config.Entrypoint}}|{{json .Config.Cmd}}",
        DOCKER_IMAGE,
      ],
      DOCKER_INSPECT_TIMEOUT_MS,
    );

    const [entrypointJson, cmdJson] = stdout.trim().split("|");
    const entrypoint = this.parseJsonArray(entrypointJson);
    const cmd = this.parseJsonArray(cmdJson);

    // The checker image takes two positional args (delivery, reports) which
    // we supply at exec time, so strip any default args baked into Cmd.
    const combined = entrypoint.length > 0 ? entrypoint : cmd;
    if (combined.length === 0) {
      throw new Error(
        `Image ${DOCKER_IMAGE} has no entrypoint or cmd to execute`,
      );
    }
    return combined;
  }

  private parseJsonArray(raw: string | undefined): string[] {
    if (!raw || raw === "null") {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  public async startContainer(
    folder: vscode.WorkspaceFolder,
  ): Promise<ContainerHandle> {
    if (!this.available) {
      throw new Error("Docker is not available");
    }

    const workspacePath = folder.uri.fsPath;
    const existing = this.containers.get(workspacePath);
    if (existing) {
      return existing;
    }

    const name = this.buildContainerName(workspacePath);

    // Best-effort cleanup of any stale container with the same name.
    try {
      await runDocker(["rm", "-f", name], DOCKER_STOP_TIMEOUT_MS);
    } catch {
      // Ignore: no such container is the expected case.
    }

    const logDirPath = path.join(workspacePath, LOG_DIR);
    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true });
    }

    await runDocker(
      [
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        "-v",
        `${workspacePath}:${DELIVERY_MOUNT_DIR}`,
        "-v",
        `${logDirPath}:${REPORT_MOUNT_DIR}`,
        "--entrypoint",
        "tail",
        DOCKER_IMAGE,
        "-f",
        "/dev/null",
      ],
      DOCKER_START_TIMEOUT_MS,
    );

    const handle: ContainerHandle = { name, workspacePath };
    this.containers.set(workspacePath, handle);
    Debugger.info("Docker", "Container started", { name, workspacePath });
    return handle;
  }

  public async stopContainer(folder: vscode.WorkspaceFolder): Promise<void> {
    const workspacePath = folder.uri.fsPath;
    const handle = this.containers.get(workspacePath);
    if (!handle) {
      return;
    }
    this.containers.delete(workspacePath);
    try {
      await runDocker(["rm", "-f", handle.name], DOCKER_STOP_TIMEOUT_MS);
    } catch (error: any) {
      Debugger.warn("Docker", "Failed to stop container", {
        name: handle.name,
        error: error.message || String(error),
      });
    }
  }

  public async stopAll(): Promise<void> {
    const handles = Array.from(this.containers.values());
    this.containers.clear();
    this.initPromise = null;
    await Promise.all(
      handles.map(async (handle) => {
        try {
          await runDocker(["rm", "-f", handle.name], DOCKER_STOP_TIMEOUT_MS);
        } catch (error: any) {
          Debugger.warn("Docker", "Failed to stop container", {
            name: handle.name,
            error: error.message || String(error),
          });
        }
      }),
    );
  }

  public async executeCheck(
    context: vscode.ExtensionContext,
    workspaceFolder?: vscode.WorkspaceFolder,
  ): Promise<string> {
    await this.waitForReady();

    if (!this.available) {
      throw new Error("Docker is not available");
    }

    const activeFolder =
      workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!activeFolder) {
      throw new Error("No workspace folder found");
    }

    const workspacePath = activeFolder.uri.fsPath;
    const reportPath = getLogPath(workspacePath);

    let handle = this.containers.get(workspacePath);
    if (!handle) {
      handle = await this.startContainer(activeFolder);
    } else if (!(await this.isContainerRunning(handle.name))) {
      Debugger.warn("Docker", "Container not running, restarting", {
        name: handle.name,
      });
      this.containers.delete(workspacePath);
      handle = await this.startContainer(activeFolder);
    }

    if (!this.entrypointCmd) {
      throw new Error("Docker entrypoint not discovered");
    }

    await runDocker(
      [
        "exec",
        handle.name,
        ...this.entrypointCmd,
        DELIVERY_MOUNT_DIR,
        REPORT_MOUNT_DIR,
      ],
      DOCKER_EXEC_TIMEOUT_MS,
    );

    return reportPath;
  }

  private async isContainerRunning(name: string): Promise<boolean> {
    try {
      const { stdout } = await runDocker(
        ["inspect", "-f", "{{.State.Running}}", name],
        DOCKER_INSPECT_TIMEOUT_MS,
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  private buildContainerName(workspacePath: string): string {
    const hash = crypto
      .createHash("sha1")
      .update(workspacePath)
      .digest("hex")
      .slice(0, 8);
    return `${CONTAINER_NAME_PREFIX}-${process.pid}-${hash}`;
  }
}
