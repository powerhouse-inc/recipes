import type { PHDocument, PHBaseState } from "document-model";
import type { RoleBasedAuthAction } from "./actions.js";
import type { RoleBasedAuthState as RoleBasedAuthGlobalState } from "./schema/types.js";

type RoleBasedAuthLocalState = Record<PropertyKey, never>;

type RoleBasedAuthPHState = PHBaseState & {
  global: RoleBasedAuthGlobalState;
  local: RoleBasedAuthLocalState;
};
type RoleBasedAuthDocument = PHDocument<RoleBasedAuthPHState>;

export * from "./schema/types.js";

export type {
  RoleBasedAuthGlobalState,
  RoleBasedAuthLocalState,
  RoleBasedAuthPHState,
  RoleBasedAuthAction,
  RoleBasedAuthDocument,
};
