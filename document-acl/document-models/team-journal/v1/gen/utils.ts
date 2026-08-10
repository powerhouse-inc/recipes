/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createBaseState,
} from "document-model";
import { teamJournalUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsTeamJournalDocument,
  assertIsTeamJournalState,
  isTeamJournalDocument,
  isTeamJournalState,
} from "./document-schema.js";
import { teamJournalDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  TeamJournalGlobalState,
  TeamJournalLocalState,
  TeamJournalPHState,
} from "./types.js";

export const initialGlobalState: TeamJournalGlobalState = {
  title: "",
  entries: [],
};
export const initialLocalState: TeamJournalLocalState = {};

export const utils: DocumentModelUtils<TeamJournalPHState> = {
  fileExtension: "tjrnl",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      teamJournalDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: teamJournalUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isTeamJournalState(state);
  },
  assertIsStateOfType(state) {
    return assertIsTeamJournalState(state);
  },
  isDocumentOfType(document) {
    return isTeamJournalDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsTeamJournalDocument(document);
  },
};
