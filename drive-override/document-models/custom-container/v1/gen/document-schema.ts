/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { customContainerDocumentType } from "./document-type.js";
import { CustomContainerStateSchema } from "./schema/zod.js";
import type {
  CustomContainerDocument,
  CustomContainerPHState,
} from "./types.js";

/** Schema for validating the header object of a CustomContainer document */
export const CustomContainerDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(customContainerDocumentType),
  });

/** Schema for validating the state object of a CustomContainer document */
export const CustomContainerPHStateSchema = BaseDocumentStateSchema.extend({
  global: CustomContainerStateSchema(),
});

export const CustomContainerDocumentSchema = z.object({
  header: CustomContainerDocumentHeaderSchema,
  state: CustomContainerPHStateSchema,
  initialState: CustomContainerPHStateSchema,
});

/** Simple helper function to check if a state object is a CustomContainer document state object */
export function isCustomContainerState(
  state: unknown,
): state is CustomContainerPHState {
  return CustomContainerPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a CustomContainer document state object */
export function assertIsCustomContainerState(
  state: unknown,
): asserts state is CustomContainerPHState {
  CustomContainerPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a CustomContainer document */
export function isCustomContainerDocument(
  document: unknown,
): document is CustomContainerDocument {
  return CustomContainerDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a CustomContainer document */
export function assertIsCustomContainerDocument(
  document: unknown,
): asserts document is CustomContainerDocument {
  CustomContainerDocumentSchema.parse(document);
}
