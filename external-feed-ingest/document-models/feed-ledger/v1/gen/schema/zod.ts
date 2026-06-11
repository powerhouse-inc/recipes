/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  FeedLedgerState,
  LedgerEntry,
  LedgerEntryStatus,
  MarkSupersededInput,
  RecordEntryInput,
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

export const LedgerEntryStatusSchema = z.enum(["RECORDED", "SUPERSEDED"]);

export function FeedLedgerStateSchema(): z.ZodObject<
  Properties<FeedLedgerState>
> {
  return z.object({
    __typename: z.literal("FeedLedgerState").optional(),
    entries: z.array(z.lazy(() => LedgerEntrySchema())),
    source: z.string(),
    watermark: z.number(),
  });
}

export function LedgerEntrySchema(): z.ZodObject<Properties<LedgerEntry>> {
  return z.object({
    __typename: z.literal("LedgerEntry").optional(),
    externalId: z.string(),
    payload: z.string(),
    recordedAt: z.string(),
    sequence: z.number(),
    status: LedgerEntryStatusSchema,
    supersededBy: z.string().nullish(),
  });
}

export function MarkSupersededInputSchema(): z.ZodObject<
  Properties<MarkSupersededInput>
> {
  return z.object({
    externalId: z.string(),
    payload: z.string(),
    sequence: z.number(),
    supersededId: z.string(),
    ts: z.string(),
  });
}

export function RecordEntryInputSchema(): z.ZodObject<
  Properties<RecordEntryInput>
> {
  return z.object({
    externalId: z.string(),
    payload: z.string(),
    sequence: z.number(),
    ts: z.string(),
  });
}
