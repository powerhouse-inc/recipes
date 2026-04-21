/* eslint-disable @typescript-eslint/no-empty-object-type */
import * as z from "zod";
import type {
  AddMemberInput,
  BootstrapInput,
  GrantAdminInput,
  Note,
  RemoveMemberInput,
  RevokeAdminInput,
  RoleBasedAuthState,
  WriteNoteInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function AddMemberInputSchema(): z.ZodObject<
  Properties<AddMemberInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function BootstrapInputSchema(): z.ZodObject<
  Properties<BootstrapInput>
> {
  return z.object({
    _placeholder: z.string().nullish(),
  });
}

export function GrantAdminInputSchema(): z.ZodObject<
  Properties<GrantAdminInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function NoteSchema(): z.ZodObject<Properties<Note>> {
  return z.object({
    __typename: z.literal("Note").optional(),
    author: z.string(),
    createdAt: z.string(),
    id: z.string(),
    text: z.string(),
  });
}

export function RemoveMemberInputSchema(): z.ZodObject<
  Properties<RemoveMemberInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function RevokeAdminInputSchema(): z.ZodObject<
  Properties<RevokeAdminInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function RoleBasedAuthStateSchema(): z.ZodObject<
  Properties<RoleBasedAuthState>
> {
  return z.object({
    __typename: z.literal("RoleBasedAuthState").optional(),
    admins: z.array(z.string()),
    creator: z.string().nullish(),
    members: z.array(z.string()),
    notes: z.array(z.lazy(() => NoteSchema())),
  });
}

export function WriteNoteInputSchema(): z.ZodObject<
  Properties<WriteNoteInput>
> {
  return z.object({
    createdAt: z.string(),
    id: z.string(),
    text: z.string(),
  });
}
