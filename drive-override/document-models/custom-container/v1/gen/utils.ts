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
  assertIsCustomContainerDocument,
  assertIsCustomContainerState,
  isCustomContainerDocument,
  isCustomContainerState,
} from "./document-schema.js";
import { customContainerDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  CustomContainerGlobalState,
  CustomContainerLocalState,
  CustomContainerPHState,
} from "./types.js";

export const initialGlobalState: CustomContainerGlobalState = {
  name: "",
  description: null,
};
export const initialLocalState: CustomContainerLocalState = {};

export const utils: DocumentModelUtils<CustomContainerPHState> = {
  fileExtension: "cco",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      customContainerDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isCustomContainerState(state);
  },
  assertIsStateOfType(state) {
    return assertIsCustomContainerState(state);
  },
  isDocumentOfType(document) {
    return isCustomContainerDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsCustomContainerDocument(document);
  },
};
