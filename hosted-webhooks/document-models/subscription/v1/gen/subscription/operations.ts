/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { SubscriptionGlobalState } from "../types.js";
import type {
  ActivateAction,
  CancelAction,
  MarkPastDueAction,
} from "./actions.js";

export interface SubscriptionSubscriptionOperations {
  activateOperation: (
    state: SubscriptionGlobalState,
    action: ActivateAction,
    dispatch?: SignalDispatch,
  ) => void;
  markPastDueOperation: (
    state: SubscriptionGlobalState,
    action: MarkPastDueAction,
    dispatch?: SignalDispatch,
  ) => void;
  cancelOperation: (
    state: SubscriptionGlobalState,
    action: CancelAction,
    dispatch?: SignalDispatch,
  ) => void;
}
