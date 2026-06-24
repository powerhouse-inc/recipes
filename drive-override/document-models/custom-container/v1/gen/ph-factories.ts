/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating CustomContainerDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  CustomContainerDocument,
  CustomContainerGlobalState,
  CustomContainerLocalState,
  CustomContainerPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): CustomContainerGlobalState {
  return { name: "", description: null };
}

export function defaultLocalState(): CustomContainerLocalState {
  return {};
}

export function defaultPHState(): CustomContainerPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<CustomContainerGlobalState>,
): CustomContainerGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<CustomContainerLocalState>,
): CustomContainerLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as CustomContainerLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<CustomContainerGlobalState>,
  localState?: Partial<CustomContainerLocalState>,
): CustomContainerPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a CustomContainerDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createCustomContainerDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<CustomContainerGlobalState>;
    local?: Partial<CustomContainerLocalState>;
  }>,
): CustomContainerDocument {
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
