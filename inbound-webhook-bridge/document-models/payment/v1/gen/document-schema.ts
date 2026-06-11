/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { paymentDocumentType } from "./document-type.js";
import { PaymentStateSchema } from "./schema/zod.js";
import type { PaymentDocument, PaymentPHState } from "./types.js";

/** Schema for validating the header object of a Payment document */
export const PaymentDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(paymentDocumentType),
});

/** Schema for validating the state object of a Payment document */
export const PaymentPHStateSchema = BaseDocumentStateSchema.extend({
  global: PaymentStateSchema(),
});

export const PaymentDocumentSchema = z.object({
  header: PaymentDocumentHeaderSchema,
  state: PaymentPHStateSchema,
  initialState: PaymentPHStateSchema,
});

/** Simple helper function to check if a state object is a Payment document state object */
export function isPaymentState(state: unknown): state is PaymentPHState {
  return PaymentPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Payment document state object */
export function assertIsPaymentState(
  state: unknown,
): asserts state is PaymentPHState {
  PaymentPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Payment document */
export function isPaymentDocument(
  document: unknown,
): document is PaymentDocument {
  return PaymentDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Payment document */
export function assertIsPaymentDocument(
  document: unknown,
): asserts document is PaymentDocument {
  PaymentDocumentSchema.parse(document);
}
