/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddMemberInputSchema,
  BootstrapInputSchema,
  GrantAdminInputSchema,
  RemoveMemberInputSchema,
  RevokeAdminInputSchema,
  WriteNoteInputSchema,
} from "../schema/zod.js";
import type {
  AddMemberInput,
  BootstrapInput,
  GrantAdminInput,
  RemoveMemberInput,
  RevokeAdminInput,
  WriteNoteInput,
} from "../types.js";
import type {
  AddMemberAction,
  BootstrapAction,
  GrantAdminAction,
  RemoveMemberAction,
  RevokeAdminAction,
  WriteNoteAction,
} from "./actions.js";

export const bootstrap = (input: BootstrapInput) =>
  createAction<BootstrapAction>(
    "BOOTSTRAP",
    { ...input },
    undefined,
    BootstrapInputSchema,
    "global",
  );

export const grantAdmin = (input: GrantAdminInput) =>
  createAction<GrantAdminAction>(
    "GRANT_ADMIN",
    { ...input },
    undefined,
    GrantAdminInputSchema,
    "global",
  );

export const revokeAdmin = (input: RevokeAdminInput) =>
  createAction<RevokeAdminAction>(
    "REVOKE_ADMIN",
    { ...input },
    undefined,
    RevokeAdminInputSchema,
    "global",
  );

export const addMember = (input: AddMemberInput) =>
  createAction<AddMemberAction>(
    "ADD_MEMBER",
    { ...input },
    undefined,
    AddMemberInputSchema,
    "global",
  );

export const removeMember = (input: RemoveMemberInput) =>
  createAction<RemoveMemberAction>(
    "REMOVE_MEMBER",
    { ...input },
    undefined,
    RemoveMemberInputSchema,
    "global",
  );

export const writeNote = (input: WriteNoteInput) =>
  createAction<WriteNoteAction>(
    "WRITE_NOTE",
    { ...input },
    undefined,
    WriteNoteInputSchema,
    "global",
  );
