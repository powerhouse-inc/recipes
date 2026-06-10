import type { PHBaseState, PHDocument } from "document-model";
import type { z } from "zod";
import type { TodoItemStatusSchema } from "./schema.js";

export type TodoItemStatus = z.infer<typeof TodoItemStatusSchema>; // "TODO" | "IN_PROGRESS" | "DONE"

export type TodoItemV2 = {
  id: string;
  title: string;
  status: TodoItemStatus;
  priority: number;
};

export type TodoV2GlobalState = {
  items: TodoItemV2[];
};

export type TodoV2LocalState = Record<PropertyKey, never>;

export type TodoV2PHState = PHBaseState & {
  global: TodoV2GlobalState;
  local: TodoV2LocalState;
};

export type TodoV2Document = PHDocument<TodoV2PHState>;
