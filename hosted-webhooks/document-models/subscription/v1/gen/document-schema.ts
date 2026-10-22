/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { subscriptionDocumentType } from "./document-type.js";
import { SubscriptionStateSchema } from "./schema/zod.js";
import type { SubscriptionDocument, SubscriptionPHState } from "./types.js";

/** Schema for validating the header object of a Subscription document */
export const SubscriptionDocumentHeaderSchema = BaseDocumentHeaderSchema.extend(
  {
    documentType: z.literal(subscriptionDocumentType),
  },
);

/** Schema for validating the state object of a Subscription document */
export const SubscriptionPHStateSchema = BaseDocumentStateSchema.extend({
  global: SubscriptionStateSchema(),
});

export const SubscriptionDocumentSchema = z.object({
  header: SubscriptionDocumentHeaderSchema,
  state: SubscriptionPHStateSchema,
  initialState: SubscriptionPHStateSchema,
});

/** Simple helper function to check if a state object is a Subscription document state object */
export function isSubscriptionState(
  state: unknown,
): state is SubscriptionPHState {
  return SubscriptionPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Subscription document state object */
export function assertIsSubscriptionState(
  state: unknown,
): asserts state is SubscriptionPHState {
  SubscriptionPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Subscription document */
export function isSubscriptionDocument(
  document: unknown,
): document is SubscriptionDocument {
  return SubscriptionDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Subscription document */
export function assertIsSubscriptionDocument(
  document: unknown,
): asserts document is SubscriptionDocument {
  SubscriptionDocumentSchema.parse(document);
}
