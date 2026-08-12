/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ExpenseReportPHState } from "document-models/expense-report/v1";

import { expenseReportExpensesOperations } from "../src/reducers/expenses.js";

import {
  ApproveExpenseInputSchema,
  SubmitExpenseInputSchema,
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
    case "SUBMIT_EXPENSE": {
      SubmitExpenseInputSchema().parse(action.input);

      expenseReportExpensesOperations.submitExpenseOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "APPROVE_EXPENSE": {
      ApproveExpenseInputSchema().parse(action.input);

      expenseReportExpensesOperations.approveExpenseOperation(
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
