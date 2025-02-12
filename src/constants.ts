import * as path from "path";

export const EXPORT_FILE = "coding-style-reports.log";
export const LOG_DIR = ".vscode";
export const getLogPath = (workspaceRoot: string): string => {
  return path.join(workspaceRoot, LOG_DIR, EXPORT_FILE);
};

export const BANNED_EXTENSIONS = ["md"];

export const ERROR_DESCRIPTIONS: { [key: string]: string } = {
  "C-O1": "Repository contains compiled, temporary or unnecessary files",
  "C-O2": "Source files must only have .c or .h extensions",
  "C-O3":
    "File exceeds function limit (max 10 total, 5 non-static) or contains unrelated functions",
  "C-O4": "File/folder naming violates snake_case convention or is ambiguous",
  "C-G1": "Missing or incorrect Epitech header",
  "C-G2": "Functions not separated by exactly one empty line",
  "C-G3": "Incorrect indentation of preprocessor directives",
  "C-G4": "Use of non-constant global variables",
  "C-G5": "Including non-header files",
  "C-G6": "Invalid line endings or use of backslash",
  "C-G7": "Trailing spaces at end of line",
  "C-G8": "Leading empty lines or multiple trailing empty lines",
  "C-G9": "Non-trivial constant values not defined as constant/macro",
  "C-G10": "Use of inline assembly",
  "C-F1": "Function violates single responsibility principle",
  "C-F2":
    "Function name does not describe action or violates naming convention",
  "C-F3": "Line exceeds 80 columns",
  "C-F4": "Function body exceeds 20 lines",
  "C-F5": "Function has more than 4 parameters",
  "C-F6": "Function without parameters missing void",
  "C-F7": "Structure passed by copy instead of pointer",
  "C-F8": "Comments present inside function body",
  "C-F9": "Use of nested functions",
  "C-L1": "Multiple statements on single line",
  "C-L2": "Incorrect indentation (must use 4 spaces)",
  "C-L3": "Incorrect spacing around operators/keywords",
  "C-L4": "Incorrect curly bracket placement",
  "C-L5": "Variable declarations not at function start or multiple per line",
  "C-L6": "Missing/extra blank lines in function body",
  "C-V1": "Identifier naming violates conventions",
  "C-V2": "Structure contains unrelated members or is too large",
  "C-V3": "Incorrect pointer asterisk placement",
  "C-C1": "Too many conditional branches or excessive nesting",
  "C-C2": "Improper use of ternary operators",
  "C-C3": "Use of goto statement",
  "C-H1": "Invalid content in header file",
  "C-H2": "Missing include guard in header",
  "C-H3": "Multi-line or multi-statement macro",
  "C-A1": "Missing const qualifier for unmodified pointer data",
  "C-A2": "Use of imprecise data types",
  "C-A3": "Missing line break at end of file",
  "C-A4": "Missing static keyword for internal functions/variables",
};

export const DOCKER_IMAGE = "ghcr.io/epitech/coding-style-checker:latest";
export const DOCKER_CACHE_KEY = "lastImagePull";
export const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

export interface ErrorCode {
  line: number;
  severity: string;
  code: string;
  message: string;
}

export interface FileErrors {
  [filePath: string]: ErrorCode[];
}
