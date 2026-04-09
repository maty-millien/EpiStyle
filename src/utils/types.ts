export interface IDebugDetails {
  [key: string]: unknown;
}

export interface IErrorCode {
  line: number;
  severity: ErrorSeverity;
  code: string;
  message: string;
}

export interface IFileErrors {
  [filePath: string]: IErrorCode[];
}

export type ErrorSeverity = "MAJOR" | "MINOR" | "INFO";
