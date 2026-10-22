/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
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
  RoleBasedAuthAction,
  RoleBasedAuthDocument,
  RoleBasedAuthGlobalState,
  RoleBasedAuthLocalState,
  RoleBasedAuthPHState,
};
