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
import { fieldLogUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsFieldLogDocument,
  assertIsFieldLogState,
  isFieldLogDocument,
  isFieldLogState,
} from "./document-schema.js";
import { fieldLogDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  FieldLogGlobalState,
  FieldLogLocalState,
  FieldLogPHState,
} from "./types.js";

export const initialGlobalState: FieldLogGlobalState = { observations: [] };
export const initialLocalState: FieldLogLocalState = {};

export const utils: DocumentModelUtils<FieldLogPHState> = {
  fileExtension: "flog",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, fieldLogDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: fieldLogUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isFieldLogState(state);
  },
  assertIsStateOfType(state) {
    return assertIsFieldLogState(state);
  },
  isDocumentOfType(document) {
    return isFieldLogDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsFieldLogDocument(document);
  },
};
