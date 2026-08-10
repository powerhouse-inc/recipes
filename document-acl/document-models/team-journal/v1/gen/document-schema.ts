/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { teamJournalDocumentType } from "./document-type.js";
import { TeamJournalStateSchema } from "./schema/zod.js";
import type { TeamJournalDocument, TeamJournalPHState } from "./types.js";

/** Schema for validating the header object of a TeamJournal document */
export const TeamJournalDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(teamJournalDocumentType),
});

/** Schema for validating the state object of a TeamJournal document */
export const TeamJournalPHStateSchema = BaseDocumentStateSchema.extend({
  global: TeamJournalStateSchema(),
});

export const TeamJournalDocumentSchema = z.object({
  header: TeamJournalDocumentHeaderSchema,
  state: TeamJournalPHStateSchema,
  initialState: TeamJournalPHStateSchema,
});

/** Simple helper function to check if a state object is a TeamJournal document state object */
export function isTeamJournalState(
  state: unknown,
): state is TeamJournalPHState {
  return TeamJournalPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a TeamJournal document state object */
export function assertIsTeamJournalState(
  state: unknown,
): asserts state is TeamJournalPHState {
  TeamJournalPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a TeamJournal document */
export function isTeamJournalDocument(
  document: unknown,
): document is TeamJournalDocument {
  return TeamJournalDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a TeamJournal document */
export function assertIsTeamJournalDocument(
  document: unknown,
): asserts document is TeamJournalDocument {
  TeamJournalDocumentSchema.parse(document);
}
