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
  TeamJournalAction,
  TeamJournalDocument,
} from "document-models/team-journal/v1";
import {
  assertIsTeamJournalDocument,
  isTeamJournalDocument,
} from "./gen/document-schema.js";

/** Hook to get a TeamJournal document by its id */
export function useTeamJournalDocumentById(
  documentId: string | null | undefined,
):
  | [TeamJournalDocument, DocumentDispatch<TeamJournalAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTeamJournalDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected TeamJournal document */
export function useSelectedTeamJournalDocument(): [
  TeamJournalDocument,
  DocumentDispatch<TeamJournalAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsTeamJournalDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all TeamJournal documents in the selected drive */
export function useTeamJournalDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isTeamJournalDocument);
}

/** Hook to get all TeamJournal documents in the selected folder */
export function useTeamJournalDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isTeamJournalDocument);
}
