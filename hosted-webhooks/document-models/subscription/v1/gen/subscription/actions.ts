/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { ActivateInput, CancelInput, MarkPastDueInput } from "../types.js";

export type ActivateAction = Action & {
  type: "ACTIVATE";
  input: ActivateInput;
};
export type MarkPastDueAction = Action & {
  type: "MARK_PAST_DUE";
  input: MarkPastDueInput;
};
export type CancelAction = Action & { type: "CANCEL"; input: CancelInput };

export type SubscriptionSubscriptionAction =
  | ActivateAction
  | MarkPastDueAction
  | CancelAction;
