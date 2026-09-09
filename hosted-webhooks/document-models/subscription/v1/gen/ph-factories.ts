/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating SubscriptionDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  SubscriptionDocument,
  SubscriptionGlobalState,
  SubscriptionLocalState,
  SubscriptionPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): SubscriptionGlobalState {
  return {
    customerId: "",
    plan: "",
    seats: 0,
    status: "PENDING",
    lastFailureReason: null,
    processedEventIds: [],
  };
}

export function defaultLocalState(): SubscriptionLocalState {
  return {};
}

export function defaultPHState(): SubscriptionPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<SubscriptionGlobalState>,
): SubscriptionGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<SubscriptionLocalState>,
): SubscriptionLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as SubscriptionLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<SubscriptionGlobalState>,
  localState?: Partial<SubscriptionLocalState>,
): SubscriptionPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a SubscriptionDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createSubscriptionDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<SubscriptionGlobalState>;
    local?: Partial<SubscriptionLocalState>;
  }>,
): SubscriptionDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
