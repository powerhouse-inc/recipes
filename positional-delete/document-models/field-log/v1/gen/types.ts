/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { FieldLogAction } from "./actions.js";
import type { FieldLogState as FieldLogGlobalState } from "./schema/types.js";

type FieldLogLocalState = Record<PropertyKey, never>;

type FieldLogPHState = PHBaseState & {
  global: FieldLogGlobalState;
  local: FieldLogLocalState;
};
type FieldLogDocument = PHDocument<FieldLogPHState>;

export * from "./schema/types.js";

export type {
  FieldLogAction,
  FieldLogDocument,
  FieldLogGlobalState,
  FieldLogLocalState,
  FieldLogPHState,
};
