/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
// at document-model@6.0.2-staging.2 these are only exported from the /core subpath
import { createReducer, isDocumentAction } from "document-model/core";
import type { ExpenseReportPHState } from "document-models/expense-report/v1";

import { expenseReportLineItemsOperations } from "../src/reducers/line-items.js";

import {
  AddLineItemInputSchema,
  DeleteLineItemInputSchema,
  UpdateLineItemInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<ExpenseReportPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_LINE_ITEM": {
      AddLineItemInputSchema().parse(action.input);

      expenseReportLineItemsOperations.addLineItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_LINE_ITEM": {
      UpdateLineItemInputSchema().parse(action.input);

      expenseReportLineItemsOperations.updateLineItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "DELETE_LINE_ITEM": {
      DeleteLineItemInputSchema().parse(action.input);

      expenseReportLineItemsOperations.deleteLineItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<ExpenseReportPHState> =
  createReducer(stateReducer);
