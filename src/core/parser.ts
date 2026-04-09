import * as fs from "fs";
import * as path from "path";
import { Debugger } from "../utils/debugger";
import { ErrorSeverity, IFileErrors } from "../utils/types";

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

    const gitignorePath = path.join(workspacePath, ".gitignore");
    const gitignorePatterns = fs.existsSync(gitignorePath)
      ? fs
          .readFileSync(gitignorePath, "utf-8")
          .split(/\r?\n/)
          .filter((line) => line && !line.startsWith("#"))
      : [];

    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const lines = reportContent.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      try {
        const parts = line.split(":");
        const [filePath, lineNumberStr, ...rest] = parts;
        const message = rest.join(":").trim();
        const [severity, code] = message.split(":");
        const relativeFilePath = filePath.startsWith("./")
          ? filePath.slice(2)
          : filePath;

        if (this.isTestFile(relativeFilePath)) {
          continue;
        }

        if (this.isFileIgnored(relativeFilePath, gitignorePatterns)) {
          continue;
        }

        if (!fileErrors[relativeFilePath]) {
          fileErrors[relativeFilePath] = [];
        }

        fileErrors[relativeFilePath].push({
          line: parseInt(lineNumberStr, 10) - 1,
          severity: severity as ErrorSeverity,
          code,
          message,
        });
      } catch (error) {
        Debugger.error("Parser", "Error parsing line", { error, line });
      }
    }
    return fileErrors;
  }

  private static isTestFile(filePath: string): boolean {
    return filePath.startsWith("tests/") || filePath.includes("/tests/");
  }

  private static isFileIgnored(
    filePath: string,
    gitignorePatterns: string[],
  ): boolean {
    return gitignorePatterns.some((pattern) => {
      const cleanPattern = pattern.replace(/\/$/, "");
      const regexPattern = cleanPattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*");

      return new RegExp(`^${regexPattern}(?:/.*)?$`).test(filePath);
    });
  }
}
