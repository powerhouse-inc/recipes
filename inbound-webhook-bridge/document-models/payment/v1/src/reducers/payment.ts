import type { PaymentPaymentOperations } from "document-models/payment/v1";
import { DuplicateEvent, InvalidTransition } from "../../gen/payment/error.js";

export const paymentPaymentOperations: PaymentPaymentOperations = {
  recordPaymentOperation(state, action) {
    if (state.processedEventIds.includes(action.input.eventId)) {
      throw new DuplicateEvent(
        `event ${action.input.eventId} already processed`,
      );
    }
    if (state.status !== "PENDING") {
      throw new InvalidTransition(
        `recordPayment requires status PENDING, but payment is ${state.status}`,
      );
    }
    state.status = "PAID";
    state.amountCents = action.input.amountCents;
    state.processedEventIds.push(action.input.eventId);
  },
  markFailedOperation(state, action) {
    if (state.processedEventIds.includes(action.input.eventId)) {
      throw new DuplicateEvent(
        `event ${action.input.eventId} already processed`,
      );
    }
    if (state.status !== "PENDING") {
      throw new InvalidTransition(
        `markFailed requires status PENDING, but payment is ${state.status}`,
      );
    }
    state.status = "FAILED";
    state.failureReason = action.input.reason;
    state.processedEventIds.push(action.input.eventId);
  },
  recordRefundOperation(state, action) {
    if (state.processedEventIds.includes(action.input.eventId)) {
      throw new DuplicateEvent(
        `event ${action.input.eventId} already processed`,
      );
    }
    if (state.status !== "PAID") {
      throw new InvalidTransition(
        `recordRefund requires status PAID, but payment is ${state.status}`,
      );
    }
    state.status = "REFUNDED";
    state.processedEventIds.push(action.input.eventId);
  },
};
