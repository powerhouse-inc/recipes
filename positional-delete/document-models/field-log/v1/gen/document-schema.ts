/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { fieldLogDocumentType } from "./document-type.js";
import { FieldLogStateSchema } from "./schema/zod.js";
import type { FieldLogDocument, FieldLogPHState } from "./types.js";

/** Schema for validating the header object of a FieldLog document */
export const FieldLogDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(fieldLogDocumentType),
});

/** Schema for validating the state object of a FieldLog document */
export const FieldLogPHStateSchema = BaseDocumentStateSchema.extend({
  global: FieldLogStateSchema(),
});

export const FieldLogDocumentSchema = z.object({
  header: FieldLogDocumentHeaderSchema,
  state: FieldLogPHStateSchema,
  initialState: FieldLogPHStateSchema,
});

/** Simple helper function to check if a state object is a FieldLog document state object */
export function isFieldLogState(state: unknown): state is FieldLogPHState {
  return FieldLogPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a FieldLog document state object */
export function assertIsFieldLogState(
  state: unknown,
): asserts state is FieldLogPHState {
  FieldLogPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a FieldLog document */
export function isFieldLogDocument(
  document: unknown,
): document is FieldLogDocument {
  return FieldLogDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a FieldLog document */
export function assertIsFieldLogDocument(
  document: unknown,
): asserts document is FieldLogDocument {
  FieldLogDocumentSchema.parse(document);
}
