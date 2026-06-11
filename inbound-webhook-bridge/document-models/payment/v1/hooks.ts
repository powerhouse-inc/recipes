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
  PaymentAction,
  PaymentDocument,
} from "document-models/payment/v1";
import {
  assertIsPaymentDocument,
  isPaymentDocument,
} from "./gen/document-schema.js";

/** Hook to get a Payment document by its id */
export function usePaymentDocumentById(
  documentId: string | null | undefined,
): [PaymentDocument, DocumentDispatch<PaymentAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isPaymentDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Payment document */
export function useSelectedPaymentDocument(): [
  PaymentDocument,
  DocumentDispatch<PaymentAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsPaymentDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Payment documents in the selected drive */
export function usePaymentDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isPaymentDocument);
}

/** Hook to get all Payment documents in the selected folder */
export function usePaymentDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isPaymentDocument);
}
