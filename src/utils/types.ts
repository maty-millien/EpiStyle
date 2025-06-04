/*

Debug details interface::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export interface IDebugDetails {
  [key: string]: unknown;
}

/*

Error code interface::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export interface IErrorCode {
  line: number;
  severity: ErrorSeverity;
  code: string;
  message: string;
}

/*

File errors interface::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export interface IFileErrors {
  [filePath: string]: IErrorCode[];
}

/*

Error severity type::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

*/

export type ErrorSeverity = "MAJOR" | "MINOR" | "INFO";
