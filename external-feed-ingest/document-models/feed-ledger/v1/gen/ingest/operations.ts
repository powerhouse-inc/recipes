/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeedLedgerGlobalState } from "../types.js";
import type { MarkSupersededAction, RecordEntryAction } from "./actions.js";

export interface FeedLedgerIngestOperations {
  recordEntryOperation: (
    state: FeedLedgerGlobalState,
    action: RecordEntryAction,
    dispatch?: SignalDispatch,
  ) => void;
  markSupersededOperation: (
    state: FeedLedgerGlobalState,
    action: MarkSupersededAction,
    dispatch?: SignalDispatch,
  ) => void;
}
