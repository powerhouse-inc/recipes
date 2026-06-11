/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
} from "document-model";
import {
  assertIsFeedLedgerDocument,
  assertIsFeedLedgerState,
  isFeedLedgerDocument,
  isFeedLedgerState,
} from "./document-schema.js";
import { feedLedgerDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  FeedLedgerGlobalState,
  FeedLedgerLocalState,
  FeedLedgerPHState,
} from "./types.js";

export const initialGlobalState: FeedLedgerGlobalState = {
  source: "",
  watermark: 0,
  entries: [],
};
export const initialLocalState: FeedLedgerLocalState = {};

export const utils: DocumentModelUtils<FeedLedgerPHState> = {
  fileExtension: "ledger",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, feedLedgerDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isFeedLedgerState(state);
  },
  assertIsStateOfType(state) {
    return assertIsFeedLedgerState(state);
  },
  isDocumentOfType(document) {
    return isFeedLedgerDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsFeedLedgerDocument(document);
  },
};
