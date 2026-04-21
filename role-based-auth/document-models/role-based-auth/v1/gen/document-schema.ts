import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { roleBasedAuthDocumentType } from "./document-type.js";
import { RoleBasedAuthStateSchema } from "./schema/zod.js";
import type { RoleBasedAuthDocument, RoleBasedAuthPHState } from "./types.js";

/** Schema for validating the header object of a RoleBasedAuth document */
export const RoleBasedAuthDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(roleBasedAuthDocumentType),
  });

/** Schema for validating the state object of a RoleBasedAuth document */
export const RoleBasedAuthPHStateSchema = BaseDocumentStateSchema.extend({
  global: RoleBasedAuthStateSchema(),
});

export const RoleBasedAuthDocumentSchema = z.object({
  header: RoleBasedAuthDocumentHeaderSchema,
  state: RoleBasedAuthPHStateSchema,
  initialState: RoleBasedAuthPHStateSchema,
});

/** Simple helper function to check if a state object is a RoleBasedAuth document state object */
export function isRoleBasedAuthState(
  state: unknown,
): state is RoleBasedAuthPHState {
  return RoleBasedAuthPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a RoleBasedAuth document state object */
export function assertIsRoleBasedAuthState(
  state: unknown,
): asserts state is RoleBasedAuthPHState {
  RoleBasedAuthPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a RoleBasedAuth document */
export function isRoleBasedAuthDocument(
  document: unknown,
): document is RoleBasedAuthDocument {
  return RoleBasedAuthDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a RoleBasedAuth document */
export function assertIsRoleBasedAuthDocument(
  document: unknown,
): asserts document is RoleBasedAuthDocument {
  RoleBasedAuthDocumentSchema.parse(document);
}
