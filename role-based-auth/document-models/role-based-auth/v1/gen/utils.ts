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
import { roleBasedAuthUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsRoleBasedAuthDocument,
  assertIsRoleBasedAuthState,
  isRoleBasedAuthDocument,
  isRoleBasedAuthState,
} from "./document-schema.js";
import { roleBasedAuthDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
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
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      roleBasedAuthDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: roleBasedAuthUpgradeManifest,
    });
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
