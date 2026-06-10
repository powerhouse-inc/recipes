import type { PHBaseState, PHDocument } from "document-model";

export type TodoItemV1 = {
  id: string;
  title: string;
  checked: boolean;
};

export type TodoV1GlobalState = {
  items: TodoItemV1[];
};

export type TodoV1LocalState = Record<PropertyKey, never>;

export type TodoV1PHState = PHBaseState & {
  global: TodoV1GlobalState;
  local: TodoV1LocalState;
};

export type TodoV1Document = PHDocument<TodoV1PHState>;
