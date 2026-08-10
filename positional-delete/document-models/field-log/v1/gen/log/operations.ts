/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FieldLogGlobalState } from "../types.js";
import type { LogObservationAction } from "./actions.js";

export interface FieldLogLogOperations {
  logObservationOperation: (
    state: FieldLogGlobalState,
    action: LogObservationAction,
    dispatch?: SignalDispatch,
  ) => void;
}
