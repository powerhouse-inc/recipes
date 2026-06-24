/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating FeedLedgerDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  FeedLedgerDocument,
  FeedLedgerGlobalState,
  FeedLedgerLocalState,
  FeedLedgerPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): FeedLedgerGlobalState {
  return { source: "", watermark: 0, entries: [] };
}

export function defaultLocalState(): FeedLedgerLocalState {
  return {};
}

export function defaultPHState(): FeedLedgerPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<FeedLedgerGlobalState>,
): FeedLedgerGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<FeedLedgerLocalState>,
): FeedLedgerLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as FeedLedgerLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<FeedLedgerGlobalState>,
  localState?: Partial<FeedLedgerLocalState>,
): FeedLedgerPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a FeedLedgerDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createFeedLedgerDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<FeedLedgerGlobalState>;
    local?: Partial<FeedLedgerLocalState>;
  }>,
): FeedLedgerDocument {
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
