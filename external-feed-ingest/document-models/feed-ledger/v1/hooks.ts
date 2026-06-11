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
  FeedLedgerAction,
  FeedLedgerDocument,
} from "document-models/feed-ledger/v1";
import {
  assertIsFeedLedgerDocument,
  isFeedLedgerDocument,
} from "./gen/document-schema.js";

/** Hook to get a FeedLedger document by its id */
export function useFeedLedgerDocumentById(
  documentId: string | null | undefined,
):
  | [FeedLedgerDocument, DocumentDispatch<FeedLedgerAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isFeedLedgerDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected FeedLedger document */
export function useSelectedFeedLedgerDocument(): [
  FeedLedgerDocument,
  DocumentDispatch<FeedLedgerAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsFeedLedgerDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all FeedLedger documents in the selected drive */
export function useFeedLedgerDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isFeedLedgerDocument);
}

/** Hook to get all FeedLedger documents in the selected folder */
export function useFeedLedgerDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isFeedLedgerDocument);
}
