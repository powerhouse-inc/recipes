/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { PaymentPHState } from "document-models/payment/v1";

import { paymentPaymentOperations } from "../src/reducers/payment.js";

import {
  MarkFailedInputSchema,
  RecordPaymentInputSchema,
  RecordRefundInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<PaymentPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "RECORD_PAYMENT": {
      RecordPaymentInputSchema().parse(action.input);

      paymentPaymentOperations.recordPaymentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MARK_FAILED": {
      MarkFailedInputSchema().parse(action.input);

      paymentPaymentOperations.markFailedOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RECORD_REFUND": {
      RecordRefundInputSchema().parse(action.input);

      paymentPaymentOperations.recordRefundOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<PaymentPHState> = createReducer(stateReducer);
