import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import { reducer } from "./reducer.js";
import { roleBasedAuthDocumentType } from "./document-type.js";
import {
  assertIsRoleBasedAuthDocument,
  assertIsRoleBasedAuthState,
  isRoleBasedAuthDocument,
  isRoleBasedAuthState,
} from "./document-schema.js";
import type {
  RoleBasedAuthGlobalState,
  RoleBasedAuthLocalState,
  RoleBasedAuthPHState,
} from "./types.js";

export const initialGlobalState: RoleBasedAuthGlobalState = {
  creator: null,
  admins: [],
  members: [],
  notes: [],
};
export const initialLocalState: RoleBasedAuthLocalState = {};

export const utils: DocumentModelUtils<RoleBasedAuthPHState> = {
  fileExtension: "rbauth",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = roleBasedAuthDocumentType;

    // for backwards compatibility, but this is NOT a valid signed document id
    document.header.id = generateId();

    return document;
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isRoleBasedAuthState(state);
  },
  assertIsStateOfType(state) {
    return assertIsRoleBasedAuthState(state);
  },
  isDocumentOfType(document) {
    return isRoleBasedAuthDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsRoleBasedAuthDocument(document);
  },
};
