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
});
