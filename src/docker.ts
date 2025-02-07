import { exec } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXPORT_FILE } from './constants';

/**
 * Executes the Docker command to perform the coding style check.
 * @param filePath - The path of the file triggering the analysis.
 * @returns A promise with the path to the generated report.
 */
export async function executeDockerCheck(filePath: string): Promise<string> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    const deliveryDir = workspaceFolder.uri.fsPath;
    const reportsDir = deliveryDir;
    const reportPath = path.join(reportsDir, EXPORT_FILE);

    return new Promise((resolve, reject) => {
        const command = [
            'docker run --platform linux/amd64 --rm -i',
            `-v "${deliveryDir}:/mnt/delivery"`,
            `-v "${reportsDir}:/mnt/reports"`,
            'ghcr.io/epitech/coding-style-checker:latest',
            '/mnt/delivery',
            '/mnt/reports'
        ].join(' ');
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Docker error: ${stderr}`);
            } else {
                resolve(reportPath);
            }
        });
    });
}
