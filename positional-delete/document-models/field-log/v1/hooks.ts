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
  FieldLogAction,
  FieldLogDocument,
} from "document-models/field-log/v1";
import {
  assertIsFieldLogDocument,
  isFieldLogDocument,
} from "./gen/document-schema.js";

/** Hook to get a FieldLog document by its id */
export function useFieldLogDocumentById(
  documentId: string | null | undefined,
):
  | [FieldLogDocument, DocumentDispatch<FieldLogAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isFieldLogDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected FieldLog document */
export function useSelectedFieldLogDocument(): [
  FieldLogDocument,
  DocumentDispatch<FieldLogAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsFieldLogDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all FieldLog documents in the selected drive */
export function useFieldLogDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isFieldLogDocument);
}

/** Hook to get all FieldLog documents in the selected folder */
export function useFieldLogDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isFieldLogDocument);
}
