/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { FieldLogPHState } from "document-models/field-log/v1";

import { fieldLogLogOperations } from "../src/reducers/log.js";

import { LogObservationInputSchema } from "./schema/zod.js";

const stateReducer: StateReducer<FieldLogPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "LOG_OBSERVATION": {
      LogObservationInputSchema().parse(action.input);

      fieldLogLogOperations.logObservationOperation(
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

export const reducer: Reducer<FieldLogPHState> = createReducer(stateReducer);
