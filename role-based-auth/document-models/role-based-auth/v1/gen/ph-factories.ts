/**
 * Factory methods for creating RoleBasedAuthDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  RoleBasedAuthDocument,
  RoleBasedAuthGlobalState,
  RoleBasedAuthLocalState,
  RoleBasedAuthPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): RoleBasedAuthGlobalState {
  return { creator: null, admins: [], members: [], notes: [] };
}

export function defaultLocalState(): RoleBasedAuthLocalState {
  return {};
}

export function defaultPHState(): RoleBasedAuthPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<RoleBasedAuthGlobalState>,
): RoleBasedAuthGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as RoleBasedAuthGlobalState;
}

export function createLocalState(
  state?: Partial<RoleBasedAuthLocalState>,
): RoleBasedAuthLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as RoleBasedAuthLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<RoleBasedAuthGlobalState>,
  localState?: Partial<RoleBasedAuthLocalState>,
): RoleBasedAuthPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a RoleBasedAuthDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createRoleBasedAuthDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<RoleBasedAuthGlobalState>;
    local?: Partial<RoleBasedAuthLocalState>;
  }>,
): RoleBasedAuthDocument {
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
