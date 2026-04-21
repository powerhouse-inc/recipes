import { type SignalDispatch } from "document-model";
import type {
  BootstrapAction,
  GrantAdminAction,
  RevokeAdminAction,
  AddMemberAction,
  RemoveMemberAction,
  WriteNoteAction,
} from "./actions.js";
import type { RoleBasedAuthState } from "../types.js";

export interface RoleBasedAuthAccessOperations {
  bootstrapOperation: (
    state: RoleBasedAuthState,
    action: BootstrapAction,
    dispatch?: SignalDispatch,
  ) => void;
  grantAdminOperation: (
    state: RoleBasedAuthState,
    action: GrantAdminAction,
    dispatch?: SignalDispatch,
  ) => void;
  revokeAdminOperation: (
    state: RoleBasedAuthState,
    action: RevokeAdminAction,
    dispatch?: SignalDispatch,
  ) => void;
  addMemberOperation: (
    state: RoleBasedAuthState,
    action: AddMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeMemberOperation: (
    state: RoleBasedAuthState,
    action: RemoveMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
  writeNoteOperation: (
    state: RoleBasedAuthState,
    action: WriteNoteAction,
    dispatch?: SignalDispatch,
  ) => void;
}
