/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
} from "document-model";
import {
  assertIsPaymentDocument,
  assertIsPaymentState,
  isPaymentDocument,
  isPaymentState,
} from "./document-schema.js";
import { paymentDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  PaymentGlobalState,
  PaymentLocalState,
  PaymentPHState,
} from "./types.js";

export const initialGlobalState: PaymentGlobalState = {
  orderId: "",
  amountCents: 0,
  currency: "usd",
  status: "PENDING",
  failureReason: null,
  processedEventIds: [],
};
export const initialLocalState: PaymentLocalState = {};

export const utils: DocumentModelUtils<PaymentPHState> = {
  fileExtension: "payment",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, paymentDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isPaymentState(state);
  },
  assertIsStateOfType(state) {
    return assertIsPaymentState(state);
  },
  isDocumentOfType(document) {
    return isPaymentDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsPaymentDocument(document);
  },
};
