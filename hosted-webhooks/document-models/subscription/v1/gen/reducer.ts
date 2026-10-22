/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { SubscriptionPHState } from "document-models/subscription/v1";

import { subscriptionSubscriptionOperations } from "../src/reducers/subscription.js";

import {
  ActivateInputSchema,
  CancelInputSchema,
  MarkPastDueInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<SubscriptionPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ACTIVATE": {
      ActivateInputSchema().parse(action.input);

      subscriptionSubscriptionOperations.activateOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MARK_PAST_DUE": {
      MarkPastDueInputSchema().parse(action.input);

      subscriptionSubscriptionOperations.markPastDueOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CANCEL": {
      CancelInputSchema().parse(action.input);

      subscriptionSubscriptionOperations.cancelOperation(
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

export const reducer: Reducer<SubscriptionPHState> =
  createReducer(stateReducer);
