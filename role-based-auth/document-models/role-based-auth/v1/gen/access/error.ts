export type ErrorCode =
  | "NotAuthorized"
  | "AlreadyBootstrapped"
  | "NotAdmin"
  | "CannotRevokeCreator"
  | "LastAdmin"
  | "AddressAlreadyAdmin";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class NotAuthorized extends Error implements ReducerError {
  errorCode = "NotAuthorized" as ErrorCode;
  constructor(message = "NotAuthorized") {
    super(message);
  }
}

export class AlreadyBootstrapped extends Error implements ReducerError {
  errorCode = "AlreadyBootstrapped" as ErrorCode;
  constructor(message = "AlreadyBootstrapped") {
    super(message);
  }
}

export class NotAdmin extends Error implements ReducerError {
  errorCode = "NotAdmin" as ErrorCode;
  constructor(message = "NotAdmin") {
    super(message);
  }
}

export class CannotRevokeCreator extends Error implements ReducerError {
  errorCode = "CannotRevokeCreator" as ErrorCode;
  constructor(message = "CannotRevokeCreator") {
    super(message);
  }
}

export class LastAdmin extends Error implements ReducerError {
  errorCode = "LastAdmin" as ErrorCode;
  constructor(message = "LastAdmin") {
    super(message);
  }
}

export class AddressAlreadyAdmin extends Error implements ReducerError {
  errorCode = "AddressAlreadyAdmin" as ErrorCode;
  constructor(message = "AddressAlreadyAdmin") {
    super(message);
  }
}

export const errors = {
  Bootstrap: { NotAuthorized, AlreadyBootstrapped },
  GrantAdmin: { NotAuthorized, NotAdmin },
  RevokeAdmin: { NotAuthorized, NotAdmin, CannotRevokeCreator, LastAdmin },
  AddMember: { NotAuthorized, NotAdmin, AddressAlreadyAdmin },
  RemoveMember: { NotAuthorized, NotAdmin },
  WriteNote: { NotAuthorized },
};
