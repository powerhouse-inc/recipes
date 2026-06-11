/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { MarkSupersededInput, RecordEntryInput } from "../types.js";

export type RecordEntryAction = Action & {
  type: "RECORD_ENTRY";
  input: RecordEntryInput;
};
export type MarkSupersededAction = Action & {
  type: "MARK_SUPERSEDED";
  input: MarkSupersededInput;
};

export type FeedLedgerIngestAction = RecordEntryAction | MarkSupersededAction;
