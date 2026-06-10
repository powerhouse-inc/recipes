import {
  addLineItem,
  deleteLineItem,
  isExpenseReportDocument,
  reducer,
  updateLineItem,
  utils,
} from "document-models/expense-report/v1";
import { describe, expect, it } from "vitest";

const ITEM = {
  id: "li-1",
  amount: 100,
  currency: "USD",
  category: "Travel/Flights",
  date: "2025-01-15",
};

describe("LineItemsOperations", () => {
  it("should handle addLineItem operation", () => {
    const document = utils.createDocument();

    const updatedDocument = reducer(document, addLineItem(ITEM));

    expect(isExpenseReportDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].error).toBeUndefined();
    expect(updatedDocument.state.global.lineItems).toStrictEqual([ITEM]);
  });

  it("should reject a duplicate line item id", () => {
    let document = utils.createDocument();
    document = reducer(document, addLineItem(ITEM));
    document = reducer(document, addLineItem(ITEM));

    expect(document.operations.global).toHaveLength(2);
    expect(document.operations.global[1].error).toContain("li-1");
    expect(document.state.global.lineItems).toHaveLength(1);
  });

  it("should handle updateLineItem operation", () => {
    let document = utils.createDocument();
    document = reducer(document, addLineItem(ITEM));
    document = reducer(
      document,
      updateLineItem({ id: "li-1", amount: 150, date: "2025-03-15" }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.lineItems).toStrictEqual([
      { ...ITEM, amount: 150, date: "2025-03-15" },
    ]);
  });

  it("should reject an update of an unknown line item", () => {
    let document = utils.createDocument();
    document = reducer(document, updateLineItem({ id: "nope", amount: 1 }));

    expect(document.operations.global[0].error).toContain("nope");
    expect(document.state.global.lineItems).toHaveLength(0);
  });

  it("should handle deleteLineItem operation", () => {
    let document = utils.createDocument();
    document = reducer(document, addLineItem(ITEM));
    document = reducer(document, deleteLineItem({ id: "li-1" }));

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.lineItems).toHaveLength(0);
  });

  it("should reject a delete of an unknown line item", () => {
    let document = utils.createDocument();
    document = reducer(document, deleteLineItem({ id: "nope" }));

    expect(document.operations.global[0].error).toContain("nope");
  });
});
