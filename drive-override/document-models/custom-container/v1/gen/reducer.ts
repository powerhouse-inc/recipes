/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { CustomContainerPHState } from "document-models/custom-container/v1";

import { customContainerMetadataOperations } from "../src/reducers/metadata.js";

import { SetMetadataInputSchema } from "./schema/zod.js";

const stateReducer: StateReducer<CustomContainerPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_METADATA": {
      SetMetadataInputSchema().parse(action.input);

      customContainerMetadataOperations.setMetadataOperation(
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

export const reducer: Reducer<CustomContainerPHState> =
  createReducer(stateReducer);
