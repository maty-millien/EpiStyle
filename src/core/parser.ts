import * as fs from "fs";
import ignore, { Ignore } from "ignore";
import * as path from "path";
import { Debugger } from "../utils/debugger";
import { ErrorSeverity, IFileErrors } from "../utils/types";

const LINE_REGEX = /^(.+?):(\d+):(MAJOR|MINOR|INFO):(C-[A-Z]+\d+)\s*$/;

export class Parser {
  public static parseReport(
    reportPath: string,
    workspacePath: string,
  ): IFileErrors {
    const fileErrors: IFileErrors = {};
    if (!fs.existsSync(reportPath)) {
      Debugger.warn("Parser", "Report file not found", { reportPath });
      return fileErrors;
    }

    const gitignore = this.loadGitignore(workspacePath);
    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const lines = reportContent.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const match = line.match(LINE_REGEX);
      if (!match) {
        Debugger.warn("Parser", "Malformed report line", { line });
        continue;
      }

      const [, filePath, lineNumberStr, severity, code] = match;
      const lineNumber = parseInt(lineNumberStr, 10);
      if (!Number.isFinite(lineNumber) || lineNumber < 1) {
        Debugger.warn("Parser", "Invalid line number", { line });
        continue;
      }

      const relativeFilePath = filePath.startsWith("./")
        ? filePath.slice(2)
        : filePath;

      if (!relativeFilePath || relativeFilePath.startsWith("/")) {
        continue;
      }

      if (this.isTestFile(relativeFilePath)) {
        continue;
      }

      if (gitignore && gitignore.ignores(relativeFilePath)) {
        continue;
      }

      if (!fileErrors[relativeFilePath]) {
        fileErrors[relativeFilePath] = [];
      }

      fileErrors[relativeFilePath].push({
        line: lineNumber - 1,
        severity: severity as ErrorSeverity,
        code,
        message: `${severity}:${code}`,
      });
    }
    return fileErrors;
  }

  private static loadGitignore(workspacePath: string): Ignore | null {
    const gitignorePath = path.join(workspacePath, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      return null;
    }
    try {
      const contents = fs.readFileSync(gitignorePath, "utf-8");
      return ignore().add(contents);
    } catch (error) {
      Debugger.warn("Parser", "Failed to read .gitignore", { error });
      return null;
    }
  }

  private static isTestFile(filePath: string): boolean {
    return filePath.startsWith("tests/") || filePath.includes("/tests/");
  }
}
