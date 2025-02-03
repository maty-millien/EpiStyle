import * as fs from 'fs';
import * as path from 'path';
import { FileErrors } from './constants';

/**
 * Parses the coding style report file and organizes errors by file.
 * @param reportPath - The path to the report file.
 * @param currentFilePath - The path of the current file triggering the analysis.
 * @returns An object mapping file paths to arrays of error codes.
 */
export function parseReportFile(reportPath: string, currentFilePath: string): FileErrors {
    const fileErrors: FileErrors = {};
    if (!fs.existsSync(reportPath)) {return fileErrors;}

    const gitignorePath = path.join(path.dirname(currentFilePath), '.gitignore');
    const gitignorePatterns = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf-8').split('\n').map(line => line.trim())
        : [];

    const reportContent = fs.readFileSync(reportPath, 'utf-8');
    const lines = reportContent.split('\n').filter(line => line.trim());

    lines.forEach(line => {
        try {
            const [filePath, lineNumberStr, ...rest] = line.split(':');
            const message = rest.join(':').trim();
            const [severity, code] = message.split(':');
            const relativeFilePath = filePath.startsWith('./') ? filePath.slice(2) : filePath;

            // Exclude the tests/ directory from analysis
            if (relativeFilePath.startsWith('tests/') || relativeFilePath.includes('/tests/')) {
                return;
            }

            const isIgnored = gitignorePatterns.some(pattern => {
                if (!pattern || pattern.startsWith('#')) {return false;}
                const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\//g, '\\/');
                return new RegExp(`^${regexPattern}$`).test(relativeFilePath);
            });
            if (isIgnored) {return;}

            if (!fileErrors[relativeFilePath]) {fileErrors[relativeFilePath] = [];}
            fileErrors[relativeFilePath].push({
                line: parseInt(lineNumberStr, 10) - 1,
                severity,
                code,
                message
            });
        } catch (error) {
            console.error('Error parsing report line:', error);
        }
    });

    return fileErrors;
}
