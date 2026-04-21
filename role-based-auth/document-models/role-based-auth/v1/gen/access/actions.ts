import type { Action } from "document-model";
import type {
  BootstrapInput,
  GrantAdminInput,
  RevokeAdminInput,
  AddMemberInput,
  RemoveMemberInput,
  WriteNoteInput,
} from "../types.js";

export type BootstrapAction = Action & {
  type: "BOOTSTRAP";
  input: BootstrapInput;
};
export type GrantAdminAction = Action & {
  type: "GRANT_ADMIN";
  input: GrantAdminInput;
};
export type RevokeAdminAction = Action & {
  type: "REVOKE_ADMIN";
  input: RevokeAdminInput;
};
export type AddMemberAction = Action & {
  type: "ADD_MEMBER";
  input: AddMemberInput;
};
export type RemoveMemberAction = Action & {
  type: "REMOVE_MEMBER";
  input: RemoveMemberInput;
};
export type WriteNoteAction = Action & {
  type: "WRITE_NOTE";
  input: WriteNoteInput;
};

export type RoleBasedAuthAccessAction =
  | BootstrapAction
  | GrantAdminAction
  | RevokeAdminAction
  | AddMemberAction
  | RemoveMemberAction
  | WriteNoteAction;
