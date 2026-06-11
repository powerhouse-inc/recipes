import { describe, expect, it } from "vitest";
import type { Action } from "document-model";
import {
  createPaymentDocument,
  markFailed,
  recordPayment,
  recordRefund,
  reducer,
  type PaymentDocument,
} from "./payment-model.js";

function dispatch(doc: PaymentDocument, action: Action): PaymentDocument {
  return reducer(doc, action) as PaymentDocument;
}

function lastError(doc: PaymentDocument): string | undefined {
  const ops = doc.operations.global;
  return ops[ops.length - 1]?.error;
}

function pending(): PaymentDocument {
  return createPaymentDocument({ orderId: "o1", amountCents: 4200, currency: "usd" });
}

describe("payment reducer state machine", () => {
  it("advances PENDING -> PAID on recordPayment", () => {
    const doc = dispatch(pending(), recordPayment({ eventId: "e1", amountCents: 4200 }));
    expect(doc.state.global.status).toBe("PAID");
    expect(doc.state.global.processedEventIds).toEqual(["e1"]);
  });

  it("advances PENDING -> FAILED on markFailed", () => {
    const doc = dispatch(pending(), markFailed({ eventId: "e1", reason: "card_declined" }));
    expect(doc.state.global.status).toBe("FAILED");
    expect(doc.state.global.failureReason).toBe("card_declined");
  });

  it("advances PAID -> REFUNDED on recordRefund", () => {
    let doc = dispatch(pending(), recordPayment({ eventId: "e1", amountCents: 4200 }));
    doc = dispatch(doc, recordRefund({ eventId: "e2", amountCents: 4200 }));
    expect(doc.state.global.status).toBe("REFUNDED");
    expect(doc.state.global.processedEventIds).toEqual(["e1", "e2"]);
  });

  it("rejects an invalid transition without changing state", () => {
    let doc = dispatch(pending(), recordPayment({ eventId: "e1", amountCents: 4200 }));
    // recordPayment again: payment is no longer PENDING.
    doc = dispatch(doc, recordPayment({ eventId: "e2", amountCents: 1 }));
    expect(lastError(doc)).toMatch(/requires status PENDING/i);
    expect(doc.state.global.status).toBe("PAID");
    expect(doc.state.global.amountCents).toBe(4200);
  });

  it("rejects a duplicate event id (idempotency in the reducer)", () => {
    let doc = dispatch(pending(), recordPayment({ eventId: "e1", amountCents: 4200 }));
    // A redelivery of the SAME event id, even targeting a valid transition.
    doc = dispatch(doc, recordRefund({ eventId: "e1", amountCents: 4200 }));
    expect(lastError(doc)).toMatch(/already processed/i);
    expect(doc.state.global.status).toBe("PAID");
    expect(doc.state.global.processedEventIds).toEqual(["e1"]);
  });
});
