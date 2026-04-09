import * as vscode from "vscode";
import { Analyzer } from "./core/analyzer";
import { Diagnostics } from "./core/diagnostics";
import { Docker, DockerUnavailableError } from "./core/docker";
import { Indicator } from "./core/indicator";
import { Settings } from "./core/settings";
import { RESTART_CONTAINERS_COMMAND } from "./utils/constants";

let saveDisposable: vscode.Disposable | undefined;

function setupAnalysisOnSave(isEnabled: boolean): void {
  if (saveDisposable) {
    saveDisposable.dispose();
    saveDisposable = undefined;
  }

  if (!isEnabled) {
    return;
  }

  const analyzer = Analyzer.getInstance();
  saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
    analyzer.scheduleFile(doc.uri);
  });
}

async function toggleEnabledState(): Promise<void> {
  const settings = Settings.getInstance();
  await settings.setEnabled(!settings.isEnabled());
}

async function handleDockerInitError(
  error: unknown,
  context: vscode.ExtensionContext,
): Promise<void> {
  const indicator = Indicator.getInstance();
  indicator.updateStatus(0, false, `$(error) EpiStyle unavailable`);

  const reason =
    error instanceof DockerUnavailableError ? error.reason : "other";

  let message: string;
  if (reason === "cli-missing") {
    message =
      "EpiStyle: Docker command not found. Install Docker (or a compatible runtime such as OrbStack, Colima, or Rancher Desktop), then click Retry.";
  } else if (reason === "daemon-down") {
    message =
      "EpiStyle: Docker is not running. Start your Docker runtime, then click Retry.";
  } else {
    const detail = error instanceof Error ? error.message : String(error);
    message = `EpiStyle: ${detail}`;
  }

  const choice = await vscode.window.showErrorMessage(message, "Retry");
  if (choice === "Retry") {
    startDockerInBackground(context);
  }
}

function startDockerInBackground(context: vscode.ExtensionContext): void {
  const indicator = Indicator.getInstance();
  indicator.startLoadingAnimation();

  void Docker.getInstance()
    .init(context)
    .then(() => {
      const settings = Settings.getInstance();
      if (settings.isEnabled()) {
        Analyzer.getInstance().scheduleWorkspace();
      } else {
        indicator.updateStatus(0, false);
      }
    })
    .catch((error: unknown) => {
      void handleDockerInitError(error, context);
    });
}

function isRelevantFile(uri: vscode.Uri): boolean {
  const base = uri.path.split("/").pop() ?? "";
  if (base === "Makefile") {
    return true;
  }
  const dot = base.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  const ext = base.slice(dot).toLowerCase();
  return ext === ".c" || ext === ".h";
}

export function activate(context: vscode.ExtensionContext): void {
  const settings = Settings.getInstance();
  const indicator = Indicator.getInstance();
  const analyzer = Analyzer.getInstance();

  Diagnostics.init(context);
  analyzer.init(context);
  indicator.register(context);
  indicator.registerToggleCommand(context, toggleEnabledState);

  context.subscriptions.push(
    settings.registerSettingsChangeHandler((enabled) => {
      setupAnalysisOnSave(enabled);
      if (enabled) {
        analyzer.scheduleWorkspace();
      } else {
        Diagnostics.clear();
        indicator.updateStatus(0, false);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      const docker = Docker.getInstance();
      if (!docker.isAvailable()) {
        return;
      }
      for (const removed of event.removed) {
        await docker.stopContainer(removed);
      }
      for (const added of event.added) {
        try {
          await docker.startContainer(added);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `EpiStyle: failed to start checker for ${added.name}: ${message}`,
          );
        }
      }
      analyzer.invalidateProjectCache();
      analyzer.scheduleWorkspace();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles((event) => {
      if (!event.files.some(isRelevantFile)) {
        return;
      }
      analyzer.invalidateProjectCache();
      analyzer.scheduleWorkspace();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((event) => {
      if (!event.files.some(isRelevantFile)) {
        return;
      }
      for (const uri of event.files) {
        analyzer.clearFile(uri);
      }
      analyzer.invalidateProjectCache();
      analyzer.scheduleWorkspace();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      const touched = event.files.some(
        ({ oldUri, newUri }) =>
          isRelevantFile(oldUri) || isRelevantFile(newUri),
      );
      if (!touched) {
        return;
      }
      for (const { oldUri } of event.files) {
        analyzer.clearFile(oldUri);
      }
      analyzer.invalidateProjectCache();
      analyzer.scheduleWorkspace();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(RESTART_CONTAINERS_COMMAND, async () => {
      indicator.startLoadingAnimation();
      analyzer.invalidateProjectCache();
      await Docker.getInstance().stopAll();
      startDockerInBackground(context);
    }),
  );

  setupAnalysisOnSave(settings.isEnabled());
  startDockerInBackground(context);
}

export function deactivate(): Thenable<void> {
  Indicator.getInstance().dispose();
  if (saveDisposable) {
    saveDisposable.dispose();
    saveDisposable = undefined;
  }
  return Docker.getInstance().stopAll();
}
