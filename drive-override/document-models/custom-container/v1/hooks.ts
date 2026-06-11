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
  CustomContainerAction,
  CustomContainerDocument,
} from "document-models/custom-container/v1";
import {
  assertIsCustomContainerDocument,
  isCustomContainerDocument,
} from "./gen/document-schema.js";

/** Hook to get a CustomContainer document by its id */
export function useCustomContainerDocumentById(
  documentId: string | null | undefined,
):
  | [CustomContainerDocument, DocumentDispatch<CustomContainerAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isCustomContainerDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected CustomContainer document */
export function useSelectedCustomContainerDocument(): [
  CustomContainerDocument,
  DocumentDispatch<CustomContainerAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsCustomContainerDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all CustomContainer documents in the selected drive */
export function useCustomContainerDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isCustomContainerDocument);
}

/** Hook to get all CustomContainer documents in the selected folder */
export function useCustomContainerDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isCustomContainerDocument);
}
