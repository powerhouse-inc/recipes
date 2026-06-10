import type { Action } from "document-model";
import { createAction } from "document-model";
import {
  AddItemInputSchema,
  SetPriorityInputSchema,
  SetStatusInputSchema,
  type AddItemInput,
  type SetPriorityInput,
  type SetStatusInput,
} from "./schema.js";

export type AddItemAction = Action & { type: "ADD_ITEM"; input: AddItemInput };
export type SetStatusAction = Action & {
  type: "SET_STATUS";
  input: SetStatusInput;
};
export type SetPriorityAction = Action & {
  type: "SET_PRIORITY";
  input: SetPriorityInput;
};

/** Every v2 action — in a full package this union types the module's controller. */
export type TodoV2Action = AddItemAction | SetStatusAction | SetPriorityAction;

export const addItem = (input: AddItemInput) =>
  createAction<AddItemAction>(
    "ADD_ITEM",
    { ...input },
    undefined,
    AddItemInputSchema,
    "global",
  );

export const setStatus = (input: SetStatusInput) =>
  createAction<SetStatusAction>(
    "SET_STATUS",
    { ...input },
    undefined,
    SetStatusInputSchema,
    "global",
  );

export const setPriority = (input: SetPriorityInput) =>
  createAction<SetPriorityAction>(
    "SET_PRIORITY",
    { ...input },
    undefined,
    SetPriorityInputSchema,
    "global",
  );
