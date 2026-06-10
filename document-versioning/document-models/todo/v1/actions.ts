import type { Action } from "document-model";
import { createAction } from "document-model";
import {
  AddItemInputSchema,
  CheckItemInputSchema,
  type AddItemInput,
  type CheckItemInput,
} from "./schema.js";

export type AddItemAction = Action & { type: "ADD_ITEM"; input: AddItemInput };
export type CheckItemAction = Action & {
  type: "CHECK_ITEM";
  input: CheckItemInput;
};

/** Every v1 action — in a full package this union types the module's controller. */
export type TodoV1Action = AddItemAction | CheckItemAction;

export const addItem = (input: AddItemInput) =>
  createAction<AddItemAction>(
    "ADD_ITEM",
    { ...input },
    undefined,
    AddItemInputSchema,
    "global",
  );

export const checkItem = (input: CheckItemInput) =>
  createAction<CheckItemAction>(
    "CHECK_ITEM",
    { ...input },
    undefined,
    CheckItemInputSchema,
    "global",
  );
