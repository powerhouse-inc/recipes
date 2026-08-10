export type ErrorCode = "DuplicateObservation";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateObservation extends Error implements ReducerError {
  errorCode = "DuplicateObservation" as ErrorCode;
  constructor(message = "DuplicateObservation") {
    super(message);
  }
}

export const errors = {
  LogObservation: { DuplicateObservation },
};
