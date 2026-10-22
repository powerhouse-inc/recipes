/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { SubscriptionAction } from "./actions.js";
import type { SubscriptionState as SubscriptionGlobalState } from "./schema/types.js";

type SubscriptionLocalState = Record<PropertyKey, never>;

type SubscriptionPHState = PHBaseState & {
  global: SubscriptionGlobalState;
  local: SubscriptionLocalState;
};
type SubscriptionDocument = PHDocument<SubscriptionPHState>;

export * from "./schema/types.js";

export type {
  SubscriptionAction,
  SubscriptionDocument,
  SubscriptionGlobalState,
  SubscriptionLocalState,
  SubscriptionPHState,
};
