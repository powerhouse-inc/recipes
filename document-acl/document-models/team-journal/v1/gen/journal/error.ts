export type ErrorCode = "DuplicateEntry" | "EntryNotFound";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateEntry extends Error implements ReducerError {
  errorCode = "DuplicateEntry" as ErrorCode;
  constructor(message = "DuplicateEntry") {
    super(message);
  }
}

export class EntryNotFound extends Error implements ReducerError {
  errorCode = "EntryNotFound" as ErrorCode;
  constructor(message = "EntryNotFound") {
    super(message);
  }
}

export const errors = {
  AddEntry: { DuplicateEntry },

  PinEntry: { EntryNotFound },
};
