/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ExpenseReportGlobalState } from "../types.js";
import type {
  AddLineItemAction,
  DeleteLineItemAction,
  UpdateLineItemAction,
} from "./actions.js";

export interface ExpenseReportLineItemsOperations {
  addLineItemOperation: (
    state: ExpenseReportGlobalState,
    action: AddLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateLineItemOperation: (
    state: ExpenseReportGlobalState,
    action: UpdateLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteLineItemOperation: (
    state: ExpenseReportGlobalState,
    action: DeleteLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
}
