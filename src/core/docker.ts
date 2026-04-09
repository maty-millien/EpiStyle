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
  VERA_PROFILE,
  getLogPath,
} from "../utils/constants";
import { Debugger } from "../utils/debugger";

interface DockerResult {
  stdout: string;
  stderr: string;
}

interface DockerRawResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runDockerRaw(
  args: string[],
  timeoutMs: number,
): Promise<DockerRawResult> {
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
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

async function runDocker(
  args: string[],
  timeoutMs: number,
): Promise<DockerResult> {
  const result = await runDockerRaw(args, timeoutMs);
  if (result.code !== 0) {
    throw new Error(
      `docker ${args[0]} exited ${result.code}: ${result.stderr}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function isContainerGoneMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no such container") ||
    lower.includes("is not running") ||
    lower.includes("is not restarting") ||
    lower.includes("container not running") ||
    lower.includes("can not connect to") ||
    lower.includes("container is not paused")
  );
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
        `${workspacePath}:${DELIVERY_MOUNT_DIR}:ro`,
        "-v",
        `${logDirPath}:${REPORT_MOUNT_DIR}`,
        "--workdir",
        DELIVERY_MOUNT_DIR,
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

    if (!this.entrypointCmd) {
      throw new Error("Docker entrypoint not discovered");
    }

    const reportPath = getLogPath(activeFolder.uri.fsPath);

    const result = await this.execWithRetry(
      activeFolder,
      [...this.entrypointCmd, DELIVERY_MOUNT_DIR, REPORT_MOUNT_DIR],
      DOCKER_EXEC_TIMEOUT_MS,
    );

    if (result.code !== 0) {
      throw new Error(
        `docker exec exited ${result.code}: ${result.stderr || result.stdout}`,
      );
    }

    return reportPath;
  }

  public async executeCheckFile(
    workspaceFolder: vscode.WorkspaceFolder,
    relativePath: string,
  ): Promise<string> {
    await this.waitForReady();

    if (!this.available) {
      throw new Error("Docker is not available");
    }

    // vera++ is invoked with a workspace-relative path because the container
    // workdir is set to DELIVERY_MOUNT_DIR. That makes the emitted paths match
    // the relative format the parser already expects.
    const normalized = relativePath.split(path.sep).join("/");
    const target = normalized.startsWith("./") ? normalized : `./${normalized}`;

    const result = await this.execWithRetry(
      workspaceFolder,
      ["vera++", "--profile", VERA_PROFILE, "-d", target],
      DOCKER_EXEC_TIMEOUT_MS,
    );

    // vera++ may exit non-zero when violations are found; tolerate that as long
    // as we have output. Only treat it as a hard error if stdout is empty and
    // stderr looks like a real failure.
    if (result.code !== 0 && result.stdout.length === 0) {
      throw new Error(
        `vera++ exited ${result.code}: ${result.stderr || "no output"}`,
      );
    }

    return result.stdout;
  }

  private async execWithRetry(
    workspaceFolder: vscode.WorkspaceFolder,
    command: string[],
    timeoutMs: number,
  ): Promise<DockerRawResult> {
    const handle = await this.ensureContainer(workspaceFolder);
    const first = await runDockerRaw(
      ["exec", handle.name, ...command],
      timeoutMs,
    );

    if (!this.looksLikeContainerGone(first)) {
      return first;
    }

    Debugger.warn("Docker", "Container gone, restarting and retrying", {
      name: handle.name,
      stderr: first.stderr,
    });
    this.containers.delete(workspaceFolder.uri.fsPath);
    const fresh = await this.startContainer(workspaceFolder);
    return runDockerRaw(["exec", fresh.name, ...command], timeoutMs);
  }

  private async ensureContainer(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<ContainerHandle> {
    const existing = this.containers.get(workspaceFolder.uri.fsPath);
    if (existing) {
      return existing;
    }
    return this.startContainer(workspaceFolder);
  }

  private looksLikeContainerGone(result: DockerRawResult): boolean {
    if (result.code === 0) {
      return false;
    }
    return isContainerGoneMessage(result.stderr);
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
