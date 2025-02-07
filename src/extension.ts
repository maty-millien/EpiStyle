import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BANNED_EXTENSIONS } from './constants';
import { createDiagnostics } from './diagnostics';
import { executeDockerCheck } from './docker';
import { parseReportFile } from './parser';

// Analysis lock to prevent concurrent runs
let isAnalysisRunning = false;

/**
 * Activates the extension and registers event listeners.
 */
export function activate(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection('coding-style');

    const runAnalysis = async (doc: vscode.TextDocument) => {
        if (BANNED_EXTENSIONS.includes(doc.languageId)) {return;}
        if (isAnalysisRunning) {
            console.log('Analysis already running, skipping...');
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
        if (!workspaceFolder) {
            console.log('No workspace folder found, skipping analysis...');
            return;
        }

        try {
            isAnalysisRunning = true;
            const reportPath = await executeDockerCheck(doc.fileName);
            const fileErrorsMap = parseReportFile(reportPath, workspaceFolder.uri.fsPath);
            collection.clear();
            Object.entries(fileErrorsMap).forEach(([filePath, errors]) => {
                const absolutePath = path.resolve(workspaceFolder.uri.fsPath, filePath);
                const fileUri = vscode.Uri.file(absolutePath);
                const diagnostics = createDiagnostics(errors);
                collection.set(fileUri, diagnostics);
            });
            if (fs.existsSync(reportPath)) {
                fs.unlinkSync(reportPath);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Coding style check failed: ${error}`);
        } finally {
            isAnalysisRunning = false;
        }
    };

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(runAnalysis),
        vscode.workspace.onDidOpenTextDocument(runAnalysis)
    );
}

export function deactivate() {}
