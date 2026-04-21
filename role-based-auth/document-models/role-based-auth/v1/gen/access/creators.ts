import { createAction } from "document-model";
import {
  BootstrapInputSchema,
  GrantAdminInputSchema,
  RevokeAdminInputSchema,
  AddMemberInputSchema,
  RemoveMemberInputSchema,
  WriteNoteInputSchema,
} from "../schema/zod.js";
import type {
  BootstrapInput,
  GrantAdminInput,
  RevokeAdminInput,
  AddMemberInput,
  RemoveMemberInput,
  WriteNoteInput,
} from "../types.js";
import type {
  BootstrapAction,
  GrantAdminAction,
  RevokeAdminAction,
  AddMemberAction,
  RemoveMemberAction,
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
