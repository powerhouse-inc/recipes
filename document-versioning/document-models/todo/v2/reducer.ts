import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import { CheckItemInputSchema } from "../v1/schema.js";
import {
  AddItemInputSchema,
  SetPriorityInputSchema,
  SetStatusInputSchema,
} from "./schema.js";
import type { TodoV2PHState } from "./types.js";

const stateReducer: StateReducer<TodoV2PHState> = (state, action) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_ITEM": {
      const input = AddItemInputSchema().parse(action.input);
      state.global.items.push(input);
      break;
    }
    case "SET_STATUS": {
      const input = SetStatusInputSchema().parse(action.input);
      const item = state.global.items.find((item) => item.id === input.id);
      if (item) {
        item.status = input.status;
      }
      break;
    }
    case "SET_PRIORITY": {
      const input = SetPriorityInputSchema().parse(action.input);
      const item = state.global.items.find((item) => item.id === input.id);
      if (item) {
        item.priority = input.priority;
      }
      break;
    }
    // CHECK_ITEM no longer exists in v2, but operations recorded under v1
    // replay through this reducer (replayDocument runs the whole log through
    // the latest version). The latest reducer owns the historical log, so it
    // must keep interpreting retired operation types.
    case "CHECK_ITEM": {
      const input = CheckItemInputSchema().parse(action.input);
      const item = state.global.items.find((item) => item.id === input.id);
      if (item) {
        item.status = input.checked ? "DONE" : "TODO";
      }
      break;
    }
    default:
      return state;
  }
};

export const reducer: Reducer<TodoV2PHState> = createReducer(stateReducer);
