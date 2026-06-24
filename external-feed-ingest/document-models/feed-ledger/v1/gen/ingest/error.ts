export type ErrorCode = "DuplicateEntry" | "UnknownEntry";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateEntry extends Error implements ReducerError {
  errorCode = "DuplicateEntry" as ErrorCode;
  constructor(message = "DuplicateEntry") {
    super(message);
  }
}

export class UnknownEntry extends Error implements ReducerError {
  errorCode = "UnknownEntry" as ErrorCode;
  constructor(message = "UnknownEntry") {
    super(message);
  }
}

export const errors = {
  RecordEntry: { DuplicateEntry },
  MarkSuperseded: { UnknownEntry, DuplicateEntry },
};
