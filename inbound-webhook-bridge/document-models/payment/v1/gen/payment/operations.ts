/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PaymentGlobalState } from "../types.js";
import type {
  MarkFailedAction,
  RecordPaymentAction,
  RecordRefundAction,
} from "./actions.js";

export interface PaymentPaymentOperations {
  recordPaymentOperation: (
    state: PaymentGlobalState,
    action: RecordPaymentAction,
    dispatch?: SignalDispatch,
  ) => void;
  markFailedOperation: (
    state: PaymentGlobalState,
    action: MarkFailedAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordRefundOperation: (
    state: PaymentGlobalState,
    action: RecordRefundAction,
    dispatch?: SignalDispatch,
  ) => void;
}
