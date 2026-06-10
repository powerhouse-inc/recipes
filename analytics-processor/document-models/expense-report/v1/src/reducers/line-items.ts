import {
  DuplicateLineItem as DuplicateLineItemError,
  LineItemNotFound as LineItemNotFoundError,
} from "../../gen/line-items/error.js";
import type { ExpenseReportLineItemsOperations } from "document-models/expense-report/v1";

export const expenseReportLineItemsOperations: ExpenseReportLineItemsOperations =
  {
    addLineItemOperation(state, action) {
      if (state.lineItems.some((li) => li.id === action.input.id)) {
        throw new DuplicateLineItemError(
          `Line item ${action.input.id} already exists`,
        );
      }
      state.lineItems.push({
        id: action.input.id,
        amount: action.input.amount,
        currency: action.input.currency,
        category: action.input.category,
        date: action.input.date,
      });
    },
    updateLineItemOperation(state, action) {
      const item = state.lineItems.find((li) => li.id === action.input.id);
      if (!item) {
        throw new LineItemNotFoundError(
          `Line item ${action.input.id} does not exist`,
        );
      }
      if (action.input.amount != null) item.amount = action.input.amount;
      if (action.input.currency != null) item.currency = action.input.currency;
      if (action.input.category != null) item.category = action.input.category;
      if (action.input.date != null) item.date = action.input.date;
    },
    deleteLineItemOperation(state, action) {
      if (!state.lineItems.some((li) => li.id === action.input.id)) {
        throw new LineItemNotFoundError(
          `Line item ${action.input.id} does not exist`,
        );
      }
      state.lineItems = state.lineItems.filter(
        (li) => li.id !== action.input.id,
      );
    },
  };
