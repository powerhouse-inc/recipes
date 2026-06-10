/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddLineItemInput,
  DeleteLineItemInput,
  UpdateLineItemInput,
} from "../types.js";

export type AddLineItemAction = Action & {
  type: "ADD_LINE_ITEM";
  input: AddLineItemInput;
};
export type UpdateLineItemAction = Action & {
  type: "UPDATE_LINE_ITEM";
  input: UpdateLineItemInput;
};
export type DeleteLineItemAction = Action & {
  type: "DELETE_LINE_ITEM";
  input: DeleteLineItemInput;
};

export type ExpenseReportLineItemsAction =
  | AddLineItemAction
  | UpdateLineItemAction
  | DeleteLineItemAction;
