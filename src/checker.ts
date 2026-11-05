import { spawn } from "child_process";
import * as crypto from "crypto";
import * as path from "path";

import * as vscode from "vscode";

import { errorMessage, log } from "./config";

const SEVERITIES = ["Fatal", "Major", "Minor", "Info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface StyleError {
  line: number;
  column: number;
  severity: Severity;
  code: string;
  description: string;
}

export type FileErrors = Map<string, StyleError[]>;

export type UnavailableReason = "cli-missing" | "daemon-down" | "other";

export class CheckerUnavailableError extends Error {
  constructor(
    public readonly reason: UnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "CheckerUnavailableError";
  }
}

const IMAGE = "epistyle-epiclang";
const IMAGE_LABEL = "epistyle.image";
const IMAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PLATFORM = "linux/amd64";
const MOUNT_DIR = "/mnt/delivery";
const DOCKERFILE = `FROM ubuntu:resolute
LABEL ${IMAGE_LABEL}=1
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends software-properties-common gpg-agent \\
 && add-apt-repository -y ppa:epitech/ppa \\
 && apt-get install -y --no-install-recommends epiclang banana-coding-style-checker xxd libcsfml-dev libncurses-dev \\
 && cp -rn /usr/include/CSFML/. /usr/include/SFML/ \\
 && rm -rf /var/lib/apt/lists/*
`;

const TIMEOUT_MS = {
  probe: 5_000,
  build: 20 * 60_000,
  start: 30_000,
  stop: 10_000,
  check: 120_000,
};

const BANANA_LINE =
  /^(.+?):(?:(\d+):(\d+):)?\s+(?:warning: )?\[Banana\] \[(Fatal|Major|Minor|Info)\] (.+) \((C-[A-Z]+\d+)\)$/;
const FATAL_LINE = /^(.+?):(\d+):(\d+): fatal error: (.+)$/;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

let runtime: "native" | "docker" = "docker";
let ready: Promise<void> | null = null;
const containers = new Map<string, Promise<string>>();

function run(
  command: string,
  args: string[],
  timeoutMs: number,
  options: { cwd?: string; input?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.stdin.end(options.input);
  });
}

async function runOk(
  command: string,
  args: string[],
  timeoutMs: number,
  options?: { input?: string },
): Promise<string> {
  const result = await run(command, args, timeoutMs, options);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n").pop();
    throw new Error(`${command} ${args[0]} exited ${result.code}: ${detail}`);
  }
  return result.stdout;
}

async function succeeds(command: string, args: string[]): Promise<boolean> {
  try {
    return (await run(command, args, TIMEOUT_MS.probe)).code === 0;
  } catch {
    return false;
  }
}

function classifyDockerError(message: string): UnavailableReason {
  const lower = message.toLowerCase();
  if (/enoent|failed to start|command not found/.test(lower)) {
    return "cli-missing";
  }
  if (
    /cannot connect to the docker daemon|is the docker daemon running|docker desktop is not running|error during connect|failed to connect to the docker api|the system cannot find the file specified/.test(
      lower,
    )
  ) {
    return "daemon-down";
  }
  return "other";
}

function isContainerGone(stderr: string): boolean {
  return /no such container|is not running|container not running|can not connect to|is not paused/i.test(
    stderr,
  );
}

async function imageCreatedAt(): Promise<number | null> {
  const result = await run(
    "docker",
    ["image", "inspect", "--format", "{{.Created}}", IMAGE],
    TIMEOUT_MS.probe,
  );
  return result.code === 0 ? Date.parse(result.stdout.trim()) : null;
}

async function buildImage(fresh: boolean): Promise<void> {
  log.info(`Building ${IMAGE}${fresh ? " from scratch" : ""}`);
  await runOk(
    "docker",
    [
      "build",
      "--platform",
      PLATFORM,
      "-t",
      IMAGE,
      ...(fresh ? ["--pull", "--no-cache"] : []),
      "-",
    ],
    TIMEOUT_MS.build,
    { input: DOCKERFILE },
  );
  await run(
    "docker",
    ["image", "prune", "-f", "--filter", `label=${IMAGE_LABEL}`],
    TIMEOUT_MS.stop,
  );
}

async function refreshImage(): Promise<void> {
  try {
    await buildImage(true);
    await stopAll();
    log.info(`${IMAGE} refreshed`);
  } catch (error) {
    log.warn(`Image refresh failed, keeping the current one: ${errorMessage(error)}`);
  }
}

async function setup(forceBuild: boolean): Promise<void> {
  if (
    (await succeeds("epiclang", ["--version"])) &&
    (await succeeds("banana-check-repo", ["--help"]))
  ) {
    runtime = "native";
    log.info("Using the local epiclang install");
    return;
  }

  try {
    await runOk(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      TIMEOUT_MS.probe,
    );
  } catch (error) {
    const message = errorMessage(error);
    log.error(`Docker preflight failed: ${message}`);
    throw new CheckerUnavailableError(classifyDockerError(message), message);
  }
  runtime = "docker";

  const createdAt = await imageCreatedAt();
  if (forceBuild || createdAt === null) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "EpiStyle: building the epiclang image (takes a few minutes)",
      },
      () => buildImage(forceBuild),
    );
  } else if (Date.now() - createdAt > IMAGE_MAX_AGE_MS) {
    void refreshImage();
  }
}

function start(forceBuild: boolean): Promise<void> {
  ready = setup(forceBuild).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export function init(): Promise<void> {
  return ready ?? start(false);
}

export async function rebuild(): Promise<void> {
  await stopAll();
  return start(true);
}

async function startContainer(workspacePath: string): Promise<string> {
  const hash = crypto.createHash("sha1").update(workspacePath).digest("hex").slice(0, 8);
  const name = `epistyle-${process.pid}-${hash}`;
  await run("docker", ["rm", "-f", name], TIMEOUT_MS.stop);
  await runOk(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--platform",
      PLATFORM,
      "--name",
      name,
      "-v",
      `${workspacePath}:${MOUNT_DIR}:ro`,
      "--workdir",
      MOUNT_DIR,
      "--entrypoint",
      "tail",
      IMAGE,
      "-f",
      "/dev/null",
    ],
    TIMEOUT_MS.start,
  );
  log.info(`Container ${name} started for ${workspacePath}`);
  return name;
}

function containerFor(workspacePath: string): Promise<string> {
  let container = containers.get(workspacePath);
  if (!container) {
    const started = startContainer(workspacePath);
    started.catch(() => containers.delete(workspacePath));
    containers.set(workspacePath, started);
    container = started;
  }
  return container;
}

export async function stopFolder(workspacePath: string): Promise<void> {
  const container = containers.get(workspacePath);
  containers.delete(workspacePath);
  const name = await container?.catch(() => null);
  if (!name) {
    return;
  }
  const result = await run("docker", ["rm", "-f", name], TIMEOUT_MS.stop);
  if (result.code !== 0) {
    log.warn(`Failed to stop ${name}: ${result.stderr.trim()}`);
  }
}

export async function stopAll(): Promise<void> {
  await Promise.all([...containers.keys()].map(stopFolder));
}

async function exec(workspacePath: string, command: string[]): Promise<RunResult> {
  if (!ready) {
    throw new Error("The style checker is not available");
  }
  await ready;
  if (runtime === "native") {
    return run(command[0], command.slice(1), TIMEOUT_MS.check, {
      cwd: workspacePath,
    });
  }

  const container = containerFor(workspacePath);
  const result = await run(
    "docker",
    ["exec", await container, ...command],
    TIMEOUT_MS.check,
  );
  if (result.code === 0 || !isContainerGone(result.stderr)) {
    return result;
  }
  log.warn("Container gone, restarting it");
  if (containers.get(workspacePath) === container) {
    containers.delete(workspacePath);
  }
  return run(
    "docker",
    ["exec", await containerFor(workspacePath), ...command],
    TIMEOUT_MS.check,
  );
}

function parseLine(line: string): (StyleError & { file: string }) | null {
  const banana = BANANA_LINE.exec(line);
  if (banana) {
    const [, file, lineNb, column, severity, description, code] = banana;
    return {
      file: path.posix.normalize(file),
      line: lineNb ? Number(lineNb) - 1 : 0,
      column: column ? Number(column) - 1 : 0,
      severity: SEVERITIES.find((known) => known === severity) ?? "Info",
      code,
      description,
    };
  }
  const fatal = FATAL_LINE.exec(line);
  if (fatal) {
    const [, file, lineNb, column, message] = fatal;
    return {
      file: path.posix.normalize(file),
      line: Number(lineNb) - 1,
      column: Number(column) - 1,
      severity: "Fatal",
      code: "epiclang",
      description: `${message}, the rest of the file was not checked`,
    };
  }
  return null;
}

function parse(output: string, keep: (file: string) => boolean): FileErrors {
  const results: FileErrors = new Map();
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const error = parseLine(line.trim());
    if (!error || error.file.startsWith("/") || !keep(error.file)) {
      continue;
    }
    const key = `${error.file}:${error.line}:${error.column}:${error.code}:${error.description}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { file, ...styleError } = error;
    results.set(file, [...(results.get(file) ?? []), styleError]);
  }
  return results;
}

function assertRan(result: RunResult, command: string): void {
  if (result.code > 1) {
    throw new Error(
      `${command} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

export async function checkFiles(
  workspacePath: string,
  files: string[],
  includeDirs: string[],
): Promise<FileErrors> {
  const result = await exec(workspacePath, [
    "epiclang",
    "-fsyntax-only",
    "-fno-caret-diagnostics",
    "-fno-color-diagnostics",
    "-Wno-everything",
    ...includeDirs.map((dir) => `-I${dir}`),
    "--",
    ...files,
  ]);
  assertRan(result, "epiclang");
  const targets = new Set(files);
  return parse(result.stderr, (file) => targets.has(file));
}

export async function checkRepo(workspacePath: string): Promise<FileErrors> {
  const result = await exec(workspacePath, ["banana-check-repo"]);
  assertRan(result, "banana-check-repo");
  return parse(result.stdout, () => true);
}
