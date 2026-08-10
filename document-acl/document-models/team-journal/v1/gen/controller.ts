/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { TeamJournal } from "../module.js";
import type { TeamJournalAction, TeamJournalPHState } from "./types.js";

export const TeamJournalController = PHDocumentController.forDocumentModel<
  TeamJournalPHState,
  TeamJournalAction
>(TeamJournal);
