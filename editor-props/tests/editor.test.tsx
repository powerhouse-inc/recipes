import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DocumentDispatch } from "document-model";
import type { TodoAction } from "document-models/todo/v1";
import { addItem, createTodoDocument, reducer } from "document-models/todo/v1";
import { TodoEditor } from "editors";
import { afterEach, describe, expect, it, vi } from "vitest";
import Editor from "../editors/todo-editor/editor.js";

afterEach(cleanup);

function setup() {
  const document = reducer(
    createTodoDocument({ document: { version: 1 } }),
    addItem({ id: "a", title: "First" }),
  );
  const dispatch = vi.fn<DocumentDispatch<TodoAction>>();
  return { document, dispatch };
}

describe("todo editor", () => {
  it("renders the document it is given, without selecting one", () => {
    const { document, dispatch } = setup();
    render(<Editor document={document} dispatch={dispatch} />);

    expect(screen.getByText("First")).toBeTruthy();
  });

  it("dispatches typed actions through the dispatch prop", () => {
    const { document, dispatch } = setup();
    render(<Editor document={document} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CHECK_ITEM",
        input: { id: "a", checked: true },
      }),
    );

    fireEvent.change(screen.getByLabelText("New item"), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "ADD_ITEM",
        input: expect.objectContaining({ title: "Second" }),
      }),
    );
  });

  it("requires both props at compile time", () => {
    const { document } = setup();
    // @ts-expect-error `dispatch` is required once EditorProps has a document type
    void (<Editor document={document} />);
  });

  it("is registered on a module typed for the Todo document", () => {
    expect(TodoEditor.documentTypes).toEqual(["powerhouse/editor-props-todo"]);
  });
});
