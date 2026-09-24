/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  RoleBasedAuthAction,
  RoleBasedAuthDocument,
} from "document-models/role-based-auth/v1";
import {
  assertIsRoleBasedAuthDocument,
  isRoleBasedAuthDocument,
} from "./gen/document-schema.js";

/** Hook to get a RoleBasedAuth document by its id */
export function useRoleBasedAuthDocumentById(
  documentId: string | null | undefined,
):
  | [RoleBasedAuthDocument, DocumentDispatch<RoleBasedAuthAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isRoleBasedAuthDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected RoleBasedAuth document */
export function useSelectedRoleBasedAuthDocument(): [
  RoleBasedAuthDocument,
  DocumentDispatch<RoleBasedAuthAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsRoleBasedAuthDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all RoleBasedAuth documents in the selected drive */
export function useRoleBasedAuthDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isRoleBasedAuthDocument);
}

/** Hook to get all RoleBasedAuth documents in the selected folder */
export function useRoleBasedAuthDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isRoleBasedAuthDocument);
}
