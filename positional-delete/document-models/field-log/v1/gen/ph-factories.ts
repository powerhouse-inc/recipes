/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating FieldLogDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  FieldLogDocument,
  FieldLogGlobalState,
  FieldLogLocalState,
  FieldLogPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): FieldLogGlobalState {
  return { observations: [] };
}

export function defaultLocalState(): FieldLogLocalState {
  return {};
}

export function defaultPHState(): FieldLogPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<FieldLogGlobalState>,
): FieldLogGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<FieldLogLocalState>,
): FieldLogLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as FieldLogLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<FieldLogGlobalState>,
  localState?: Partial<FieldLogLocalState>,
): FieldLogPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a FieldLogDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createFieldLogDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<FieldLogGlobalState>;
    local?: Partial<FieldLogLocalState>;
  }>,
): FieldLogDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
