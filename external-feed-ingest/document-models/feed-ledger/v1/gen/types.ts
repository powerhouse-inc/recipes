/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { FeedLedgerAction } from "./actions.js";
import type { FeedLedgerState as FeedLedgerGlobalState } from "./schema/types.js";

type FeedLedgerLocalState = Record<PropertyKey, never>;

type FeedLedgerPHState = PHBaseState & {
  global: FeedLedgerGlobalState;
  local: FeedLedgerLocalState;
};
type FeedLedgerDocument = PHDocument<FeedLedgerPHState>;

export * from "./schema/types.js";

export type {
  FeedLedgerAction,
  FeedLedgerDocument,
  FeedLedgerGlobalState,
  FeedLedgerLocalState,
  FeedLedgerPHState,
};
