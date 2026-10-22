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
import { subscriptionUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsSubscriptionDocument,
  assertIsSubscriptionState,
  isSubscriptionDocument,
  isSubscriptionState,
} from "./document-schema.js";
import { subscriptionDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  SubscriptionGlobalState,
  SubscriptionLocalState,
  SubscriptionPHState,
} from "./types.js";

export const initialGlobalState: SubscriptionGlobalState = {
  customerId: "",
  plan: "",
  seats: 0,
  status: "PENDING",
  lastFailureReason: null,
  processedEventIds: [],
};
export const initialLocalState: SubscriptionLocalState = {};

export const utils: DocumentModelUtils<SubscriptionPHState> = {
  fileExtension: "subscription",
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
      subscriptionDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: subscriptionUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isSubscriptionState(state);
  },
  assertIsStateOfType(state) {
    return assertIsSubscriptionState(state);
  },
  isDocumentOfType(document) {
    return isSubscriptionDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsSubscriptionDocument(document);
  },
};
