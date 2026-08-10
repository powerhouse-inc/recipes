/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { TeamJournalPHState } from "document-models/team-journal/v1";

import { teamJournalJournalOperations } from "../src/reducers/journal.js";

import {
  AddEntryInputSchema,
  PinEntryInputSchema,
  SetTitleInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<TeamJournalPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_ENTRY": {
      AddEntryInputSchema().parse(action.input);

      teamJournalJournalOperations.addEntryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "PIN_ENTRY": {
      PinEntryInputSchema().parse(action.input);

      teamJournalJournalOperations.pinEntryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TITLE": {
      SetTitleInputSchema().parse(action.input);

      teamJournalJournalOperations.setTitleOperation(
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

export const reducer: Reducer<TeamJournalPHState> = createReducer(stateReducer);
