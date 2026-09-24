/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { RoleBasedAuthGlobalState } from "../types.js";
import type {
  AddMemberAction,
  BootstrapAction,
  GrantAdminAction,
  RemoveMemberAction,
  RevokeAdminAction,
  WriteNoteAction,
} from "./actions.js";

export interface RoleBasedAuthAccessOperations {
  bootstrapOperation: (
    state: RoleBasedAuthGlobalState,
    action: BootstrapAction,
    dispatch?: SignalDispatch,
  ) => void;
  grantAdminOperation: (
    state: RoleBasedAuthGlobalState,
    action: GrantAdminAction,
    dispatch?: SignalDispatch,
  ) => void;
  revokeAdminOperation: (
    state: RoleBasedAuthGlobalState,
    action: RevokeAdminAction,
    dispatch?: SignalDispatch,
  ) => void;
  addMemberOperation: (
    state: RoleBasedAuthGlobalState,
    action: AddMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeMemberOperation: (
    state: RoleBasedAuthGlobalState,
    action: RemoveMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
  writeNoteOperation: (
    state: RoleBasedAuthGlobalState,
    action: WriteNoteAction,
    dispatch?: SignalDispatch,
  ) => void;
}
