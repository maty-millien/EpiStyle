import * as fs from "fs";
import * as path from "path";
import { DebugLogger } from "./debug";
import { ErrorSeverity, IFileErrors } from "./types";

export class ParserService {
  public static parseReport(
    reportPath: string,
    workspacePath: string
  ): IFileErrors {
    DebugLogger.info("Parser", "Starting report parsing", {
      reportPath,
      workspacePath,
    });

    const fileErrors: IFileErrors = {};
    if (!fs.existsSync(reportPath)) {
      DebugLogger.warn("Parser", "Report file not found", { reportPath });
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
          DebugLogger.debug("Parser", "Skipping test file", {
            filePath: relativeFilePath,
          });
          return;
        }

        if (this.isFileIgnored(relativeFilePath, gitignorePatterns)) {
          DebugLogger.debug("Parser", "Skipping ignored file", {
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
        DebugLogger.error("Parser", "Error parsing line", { error, line });
      }
    });

    DebugLogger.info("Parser", "Finished parsing", {
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
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\//g, "\\/");
      return new RegExp(`^${regexPattern}$`).test(filePath);
    });
  }
}
