import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import { AddItemInputSchema, CheckItemInputSchema } from "./schema.js";
import type { TodoV1PHState } from "./types.js";

const stateReducer: StateReducer<TodoV1PHState> = (state, action) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_ITEM": {
      const input = AddItemInputSchema().parse(action.input);
      state.global.items.push({ ...input, checked: false });
      break;
    }
    case "CHECK_ITEM": {
      const input = CheckItemInputSchema().parse(action.input);
      const item = state.global.items.find((item) => item.id === input.id);
      if (item) {
        item.checked = input.checked;
      }
      break;
    }
    default:
      return state;
  }
};

export const reducer: Reducer<TodoV1PHState> = createReducer(stateReducer);
