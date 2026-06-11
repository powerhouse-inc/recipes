/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { CustomContainerGlobalState } from "../types.js";
import type { SetMetadataAction } from "./actions.js";

export interface CustomContainerMetadataOperations {
  setMetadataOperation: (
    state: CustomContainerGlobalState,
    action: SetMetadataAction,
    dispatch?: SignalDispatch,
  ) => void;
}
