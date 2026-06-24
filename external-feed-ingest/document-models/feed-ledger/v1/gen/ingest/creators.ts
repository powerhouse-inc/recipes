/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  MarkSupersededInputSchema,
  RecordEntryInputSchema,
} from "../schema/zod.js";
import type { MarkSupersededInput, RecordEntryInput } from "../types.js";
import type { MarkSupersededAction, RecordEntryAction } from "./actions.js";

export const recordEntry = (input: RecordEntryInput) =>
  createAction<RecordEntryAction>(
    "RECORD_ENTRY",
    { ...input },
    undefined,
    RecordEntryInputSchema,
    "global",
  );

export const markSuperseded = (input: MarkSupersededInput) =>
  createAction<MarkSupersededAction>(
    "MARK_SUPERSEDED",
    { ...input },
    undefined,
    MarkSupersededInputSchema,
    "global",
  );
