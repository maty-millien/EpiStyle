import * as fs from "fs";
import * as path from "path";
import { ErrorSeverity, IFileErrors } from "../config/types";
import { Debugger } from "../utils/debugger";

export class Parser {
  public static parseReport(
    reportPath: string,
    workspacePath: string
  ): IFileErrors {
    Debugger.info("Parser", "Starting report parsing", {
      reportPath,
      workspacePath,
    });

    const fileErrors: IFileErrors = {};
    if (!fs.existsSync(reportPath)) {
      Debugger.warn("Parser", "Report file not found", { reportPath });
      return fileErrors;
    }

    const gitignorePath = path.join(workspacePath, ".gitignore");
    const gitignorePatterns = fs.existsSync(gitignorePath)
      ? fs
          .readFileSync(gitignorePath, "utf-8")
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
      : [];

    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const lines = reportContent.split("\n").filter((line) => line.trim());

    lines.forEach((line) => {
      try {
        const parts = line.split(":");
        const [filePath, lineNumberStr, ...rest] = parts;
        const message = rest.join(":").trim();
        const [severity, code] = message.split(":");
        const relativeFilePath = filePath.startsWith("./")
          ? filePath.slice(2)
          : filePath;

        if (this.isTestFile(relativeFilePath)) {
          Debugger.info("Parser", "Skipping test file", {
            filePath: relativeFilePath,
          });
          return;
        }

        if (this.isFileIgnored(relativeFilePath, gitignorePatterns)) {
          Debugger.info("Parser", "Skipping ignored file", {
            filePath: relativeFilePath,
          });
          return;
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
    });

    Debugger.info("Parser", "Finished parsing", {
      totalFiles: Object.keys(fileErrors).length,
      totalErrors: Object.values(fileErrors).reduce(
        (sum, errors) => sum + errors.length,
        0
      ),
    });

    return fileErrors;
  }

  private static isTestFile(filePath: string): boolean {
    return filePath.startsWith("tests/") || filePath.includes("/tests/");
  }

  private static isFileIgnored(
    filePath: string,
    gitignorePatterns: string[]
  ): boolean {
    return gitignorePatterns.some((pattern) => {
      // Remove trailing slash for directory patterns
      const cleanPattern = pattern.endsWith("/")
        ? pattern.slice(0, -1)
        : pattern;

      // Create a regex pattern that matches both files and directories
      const regexPattern = cleanPattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\//g, "\\/");

      // If original pattern ends with /, it's a directory pattern
      // Match any file that starts with this directory pattern
      if (pattern.endsWith("/")) {
        return new RegExp(`^${regexPattern}(?:/.*)?$`).test(filePath);
      }

      // For regular patterns, match exactly
      return new RegExp(`^${regexPattern}$`).test(filePath);
    });
  }
}
