/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  MarkFailedInput,
  RecordPaymentInput,
  RecordRefundInput,
} from "../types.js";

export type RecordPaymentAction = Action & {
  type: "RECORD_PAYMENT";
  input: RecordPaymentInput;
};
export type MarkFailedAction = Action & {
  type: "MARK_FAILED";
  input: MarkFailedInput;
};
export type RecordRefundAction = Action & {
  type: "RECORD_REFUND";
  input: RecordRefundInput;
};

export type PaymentPaymentAction =
  | RecordPaymentAction
  | MarkFailedAction
  | RecordRefundAction;
