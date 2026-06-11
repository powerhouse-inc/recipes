/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { CustomContainerAction } from "./actions.js";
import type { CustomContainerState as CustomContainerGlobalState } from "./schema/types.js";

type CustomContainerLocalState = Record<PropertyKey, never>;

type CustomContainerPHState = PHBaseState & {
  global: CustomContainerGlobalState;
  local: CustomContainerLocalState;
};
type CustomContainerDocument = PHDocument<CustomContainerPHState>;

export * from "./schema/types.js";

export type {
  CustomContainerAction,
  CustomContainerDocument,
  CustomContainerGlobalState,
  CustomContainerLocalState,
  CustomContainerPHState,
};
