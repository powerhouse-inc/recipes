export type ErrorCode = "DuplicateEvent" | "InvalidTransition";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateEvent extends Error implements ReducerError {
  errorCode = "DuplicateEvent" as ErrorCode;
  constructor(message = "DuplicateEvent") {
    super(message);
  }
}

export class InvalidTransition extends Error implements ReducerError {
  errorCode = "InvalidTransition" as ErrorCode;
  constructor(message = "InvalidTransition") {
    super(message);
  }
}

export const errors = {
  Activate: { DuplicateEvent, InvalidTransition },

  MarkPastDue: { DuplicateEvent, InvalidTransition },

  Cancel: { DuplicateEvent, InvalidTransition },
};
