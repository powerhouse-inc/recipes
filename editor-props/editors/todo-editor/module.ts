import type { EditorModule } from "document-model";
import type { TodoAction, TodoDocument } from "document-models/todo/v1";
import { lazy } from "react";

/** Typed for Todo: an editor typed for another document model is a compile error. */
export const TodoEditor: EditorModule<TodoDocument, TodoAction> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/editor-props-todo"],
  config: {
    id: "todo-editor",
    name: "Todo Editor",
  },
};
