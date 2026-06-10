export type ErrorCode = "DuplicateLineItem" | "LineItemNotFound";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateLineItem extends Error implements ReducerError {
  errorCode = "DuplicateLineItem" as ErrorCode;
  constructor(message = "DuplicateLineItem") {
    super(message);
  }
}

export class LineItemNotFound extends Error implements ReducerError {
  errorCode = "LineItemNotFound" as ErrorCode;
  constructor(message = "LineItemNotFound") {
    super(message);
  }
}

export const errors = {
  AddLineItem: { DuplicateLineItem },
  UpdateLineItem: { LineItemNotFound },
  DeleteLineItem: { LineItemNotFound },
};
