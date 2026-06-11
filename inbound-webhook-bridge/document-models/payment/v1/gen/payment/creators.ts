/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  MarkFailedInputSchema,
  RecordPaymentInputSchema,
  RecordRefundInputSchema,
} from "../schema/zod.js";
import type {
  MarkFailedInput,
  RecordPaymentInput,
  RecordRefundInput,
} from "../types.js";
import type {
  MarkFailedAction,
  RecordPaymentAction,
  RecordRefundAction,
} from "./actions.js";

export const recordPayment = (input: RecordPaymentInput) =>
  createAction<RecordPaymentAction>(
    "RECORD_PAYMENT",
    { ...input },
    undefined,
    RecordPaymentInputSchema,
    "global",
  );

export const markFailed = (input: MarkFailedInput) =>
  createAction<MarkFailedAction>(
    "MARK_FAILED",
    { ...input },
    undefined,
    MarkFailedInputSchema,
    "global",
  );

export const recordRefund = (input: RecordRefundInput) =>
  createAction<RecordRefundAction>(
    "RECORD_REFUND",
    { ...input },
    undefined,
    RecordRefundInputSchema,
    "global",
  );
