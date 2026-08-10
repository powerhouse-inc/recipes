/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { TeamJournalAction } from "./actions.js";
import type { TeamJournalState as TeamJournalGlobalState } from "./schema/types.js";

type TeamJournalLocalState = Record<PropertyKey, never>;

type TeamJournalPHState = PHBaseState & {
  global: TeamJournalGlobalState;
  local: TeamJournalLocalState;
};
type TeamJournalDocument = PHDocument<TeamJournalPHState>;

export * from "./schema/types.js";

export type {
  TeamJournalAction,
  TeamJournalDocument,
  TeamJournalGlobalState,
  TeamJournalLocalState,
  TeamJournalPHState,
};
