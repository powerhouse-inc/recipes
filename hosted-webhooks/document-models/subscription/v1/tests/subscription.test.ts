import { generateMock } from "document-model/mock";
import {
  activate,
  ActivateInputSchema,
  cancel,
  CancelInputSchema,
  isSubscriptionDocument,
  markPastDue,
  MarkPastDueInputSchema,
  reducer,
  utils,
} from "document-models/subscription/v1";
import { describe, expect, it } from "vitest";

describe("SubscriptionOperations", () => {
  it("should handle activate operation", () => {
    const document = utils.createDocument();
    const input = generateMock(ActivateInputSchema());

    const updatedDocument = reducer(document, activate(input));

    expect(isSubscriptionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ACTIVATE");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle markPastDue operation", () => {
    const document = utils.createDocument();
    const input = generateMock(MarkPastDueInputSchema());

    const updatedDocument = reducer(document, markPastDue(input));

    expect(isSubscriptionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "MARK_PAST_DUE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle cancel operation", () => {
    const document = utils.createDocument();
    const input = generateMock(CancelInputSchema());

    const updatedDocument = reducer(document, cancel(input));

    expect(isSubscriptionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("CANCEL");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("records a repeated payment failure instead of refusing it", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      activate({
        eventId: "evt_1",
        customerId: "cus_1",
        plan: "team",
        seats: 1,
      }),
    );
    document = reducer(
      document,
      markPastDue({ eventId: "evt_2", reason: "payment attempt 1 failed" }),
    );
    document = reducer(
      document,
      markPastDue({ eventId: "evt_3", reason: "payment attempt 2 failed" }),
    );

    expect(document.operations.global.map((op) => op.error)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(document.state.global).toMatchObject({
      status: "PAST_DUE",
      lastFailureReason: "payment attempt 2 failed",
      processedEventIds: ["evt_1", "evt_2", "evt_3"],
    });
  });

  it("still refuses a payment failure for a subscription never activated", () => {
    const document = reducer(
      utils.createDocument(),
      markPastDue({ eventId: "evt_1", reason: "payment failed" }),
    );

    expect(document.operations.global[0].error).toMatch(/requires status/);
    expect(document.state.global.status).toBe("PENDING");
  });
});
