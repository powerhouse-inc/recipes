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
  SubscriptionAction,
  SubscriptionDocument,
} from "document-models/subscription/v1";
import {
  assertIsSubscriptionDocument,
  isSubscriptionDocument,
} from "./gen/document-schema.js";

/** Hook to get a Subscription document by its id */
export function useSubscriptionDocumentById(
  documentId: string | null | undefined,
):
  | [SubscriptionDocument, DocumentDispatch<SubscriptionAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isSubscriptionDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Subscription document */
export function useSelectedSubscriptionDocument(): [
  SubscriptionDocument,
  DocumentDispatch<SubscriptionAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsSubscriptionDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Subscription documents in the selected drive */
export function useSubscriptionDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isSubscriptionDocument);
}

/** Hook to get all Subscription documents in the selected folder */
export function useSubscriptionDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isSubscriptionDocument);
}
