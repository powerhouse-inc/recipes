/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { feedLedgerDocumentType } from "./document-type.js";
import { FeedLedgerStateSchema } from "./schema/zod.js";
import type { FeedLedgerDocument, FeedLedgerPHState } from "./types.js";

/** Schema for validating the header object of a FeedLedger document */
export const FeedLedgerDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(feedLedgerDocumentType),
});

/** Schema for validating the state object of a FeedLedger document */
export const FeedLedgerPHStateSchema = BaseDocumentStateSchema.extend({
  global: FeedLedgerStateSchema(),
});

export const FeedLedgerDocumentSchema = z.object({
  header: FeedLedgerDocumentHeaderSchema,
  state: FeedLedgerPHStateSchema,
  initialState: FeedLedgerPHStateSchema,
});

/** Simple helper function to check if a state object is a FeedLedger document state object */
export function isFeedLedgerState(state: unknown): state is FeedLedgerPHState {
  return FeedLedgerPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a FeedLedger document state object */
export function assertIsFeedLedgerState(
  state: unknown,
): asserts state is FeedLedgerPHState {
  FeedLedgerPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a FeedLedger document */
export function isFeedLedgerDocument(
  document: unknown,
): document is FeedLedgerDocument {
  return FeedLedgerDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a FeedLedger document */
export function assertIsFeedLedgerDocument(
  document: unknown,
): asserts document is FeedLedgerDocument {
  FeedLedgerDocumentSchema.parse(document);
}
