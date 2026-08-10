/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddEntryInput,
  JournalEntry,
  PinEntryInput,
  SetTitleInput,
  TeamJournalState,
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

export function AddEntryInputSchema(): z.ZodObject<Properties<AddEntryInput>> {
  return z.object({
    id: z.string(),
    text: z.string(),
  });
}

export function JournalEntrySchema(): z.ZodObject<Properties<JournalEntry>> {
  return z.object({
    __typename: z.literal("JournalEntry").optional(),
    author: z.string(),
    id: z.string(),
    pinned: z.boolean(),
    text: z.string(),
  });
}

export function PinEntryInputSchema(): z.ZodObject<Properties<PinEntryInput>> {
  return z.object({
    id: z.string(),
  });
}

export function SetTitleInputSchema(): z.ZodObject<Properties<SetTitleInput>> {
  return z.object({
    title: z.string(),
  });
}

export function TeamJournalStateSchema(): z.ZodObject<
  Properties<TeamJournalState>
> {
  return z.object({
    __typename: z.literal("TeamJournalState").optional(),
    entries: z.array(z.lazy(() => JournalEntrySchema())),
    title: z.string(),
  });
}
