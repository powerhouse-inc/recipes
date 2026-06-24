/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating PaymentDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  PaymentDocument,
  PaymentGlobalState,
  PaymentLocalState,
  PaymentPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): PaymentGlobalState {
  return {
    orderId: "",
    amountCents: 0,
    currency: "usd",
    status: "PENDING",
    failureReason: null,
    processedEventIds: [],
  };
}

export function defaultLocalState(): PaymentLocalState {
  return {};
}

export function defaultPHState(): PaymentPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<PaymentGlobalState>,
): PaymentGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<PaymentLocalState>,
): PaymentLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as PaymentLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<PaymentGlobalState>,
  localState?: Partial<PaymentLocalState>,
): PaymentPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a PaymentDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createPaymentDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<PaymentGlobalState>;
    local?: Partial<PaymentLocalState>;
  }>,
): PaymentDocument {
  const document = utils.createDocument(
    state
      ? createState(
          createBaseState(state.auth, state.document),
          state.global,
          state.local,
        )
      : undefined,
  );

  return document;
}
