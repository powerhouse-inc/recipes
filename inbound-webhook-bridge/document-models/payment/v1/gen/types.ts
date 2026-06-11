/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { PaymentAction } from "./actions.js";
import type { PaymentState as PaymentGlobalState } from "./schema/types.js";

type PaymentLocalState = Record<PropertyKey, never>;

type PaymentPHState = PHBaseState & {
  global: PaymentGlobalState;
  local: PaymentLocalState;
};
type PaymentDocument = PHDocument<PaymentPHState>;

export * from "./schema/types.js";

export type {
  PaymentAction,
  PaymentDocument,
  PaymentGlobalState,
  PaymentLocalState,
  PaymentPHState,
};
