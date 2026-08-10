/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating TeamJournalDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  TeamJournalDocument,
  TeamJournalGlobalState,
  TeamJournalLocalState,
  TeamJournalPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): TeamJournalGlobalState {
  return { title: "", entries: [] };
}

export function defaultLocalState(): TeamJournalLocalState {
  return {};
}

export function defaultPHState(): TeamJournalPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<TeamJournalGlobalState>,
): TeamJournalGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<TeamJournalLocalState>,
): TeamJournalLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as TeamJournalLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<TeamJournalGlobalState>,
  localState?: Partial<TeamJournalLocalState>,
): TeamJournalPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a TeamJournalDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createTeamJournalDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<TeamJournalGlobalState>;
    local?: Partial<TeamJournalLocalState>;
  }>,
): TeamJournalDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
