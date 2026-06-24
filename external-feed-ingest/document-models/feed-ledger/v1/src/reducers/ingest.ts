import type { FeedLedgerIngestOperations } from "document-models/feed-ledger/v1";
import { DuplicateEntry, UnknownEntry } from "../../gen/ingest/error.js";

export const feedLedgerIngestOperations: FeedLedgerIngestOperations = {
  recordEntryOperation(state, action) {
    if (state.entries.some((e) => e.externalId === action.input.externalId)) {
      throw new DuplicateEntry(
        `entry ${action.input.externalId} already recorded`,
      );
    }
    state.entries.push({
      externalId: action.input.externalId,
      sequence: action.input.sequence,
      payload: action.input.payload,
      recordedAt: action.input.ts,
      status: "RECORDED",
      supersededBy: null,
    });
    state.watermark = Math.max(state.watermark, action.input.sequence);
  },
  markSupersededOperation(state, action) {
    const target = state.entries.find(
      (e) => e.externalId === action.input.supersededId,
    );
    if (!target || target.status === "SUPERSEDED") {
      throw new UnknownEntry(
        `cannot supersede unknown or already-superseded entry ${action.input.supersededId}`,
      );
    }
    if (state.entries.some((e) => e.externalId === action.input.externalId)) {
      throw new DuplicateEntry(
        `correction ${action.input.externalId} already recorded`,
      );
    }
    target.status = "SUPERSEDED";
    target.supersededBy = action.input.externalId;
    state.entries.push({
      externalId: action.input.externalId,
      sequence: action.input.sequence,
      payload: action.input.payload,
      recordedAt: action.input.ts,
      status: "RECORDED",
      supersededBy: null,
    });
    state.watermark = Math.max(state.watermark, action.input.sequence);
  },
};
