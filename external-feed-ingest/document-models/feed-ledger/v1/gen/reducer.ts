/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { FeedLedgerPHState } from "document-models/feed-ledger/v1";

import { feedLedgerIngestOperations } from "../src/reducers/ingest.js";

import {
  MarkSupersededInputSchema,
  RecordEntryInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<FeedLedgerPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "RECORD_ENTRY": {
      RecordEntryInputSchema().parse(action.input);

      feedLedgerIngestOperations.recordEntryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MARK_SUPERSEDED": {
      MarkSupersededInputSchema().parse(action.input);

      feedLedgerIngestOperations.markSupersededOperation(
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

export const reducer: Reducer<FeedLedgerPHState> = createReducer(stateReducer);
