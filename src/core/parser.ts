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
          .split(/\r?\n/)
          .filter((line) => line && !line.startsWith("#"))
      : [];

    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const lines = reportContent.split(/\r?\n/).filter(Boolean);

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
      const cleanPattern = pattern.endsWith("/")
        ? pattern.slice(0, -1)
        : pattern;

      const regexPattern = cleanPattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\//g, "\\/");

      if (pattern.endsWith("/"))
        return new RegExp(`^${regexPattern}(?:/.*)?$`).test(filePath);

      return new RegExp(`^${regexPattern}$`).test(filePath);
    });
  }
}
