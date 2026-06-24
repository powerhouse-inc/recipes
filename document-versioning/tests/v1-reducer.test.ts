import { describe, expect, it } from "vitest";
import { addItem, checkItem, reducer } from "document-models/todo/v1";
import { createV1Todo } from "../src/todo.js";

describe("todo v1 reducer", () => {
  it("appends items with checked: false", () => {
    let doc = createV1Todo();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));
    doc = reducer(doc, addItem({ id: "b", title: "Second" }));

    expect(doc.state.global.items).toEqual([
      { id: "a", title: "First", checked: false },
      { id: "b", title: "Second", checked: false },
    ]);
  });

  it("sets checked on an existing item", () => {
    let doc = createV1Todo();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));
    doc = reducer(doc, checkItem({ id: "a", checked: true }));

    expect(doc.state.global.items[0].checked).toBe(true);
  });

  it("records operations in the global scope with increasing indices", () => {
    let doc = createV1Todo();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));
    doc = reducer(doc, checkItem({ id: "a", checked: true }));

    const ops = doc.operations.global;
    expect(ops.map((op) => op.action.type)).toEqual([
      "ADD_ITEM",
      "CHECK_ITEM",
    ]);
    expect(ops.map((op) => op.index)).toEqual([0, 1]);
  });

  it("starts at model version 1", () => {
    const doc = createV1Todo();
    expect(doc.state.document.version).toBe(1);
  });
});
