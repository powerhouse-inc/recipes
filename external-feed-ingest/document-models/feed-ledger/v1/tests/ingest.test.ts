import {
  createFeedLedgerDocument,
  markSuperseded,
  recordEntry,
  reducer,
  type FeedLedgerDocument,
} from "document-models/feed-ledger/v1";
import { describe, expect, it } from "vitest";

function freshDoc(): FeedLedgerDocument {
  return createFeedLedgerDocument({ global: { source: "test" } });
}

describe("ingest reducer", () => {
  it("records an entry and advances the watermark to its sequence", () => {
    const doc = reducer(
      freshDoc(),
      recordEntry({ externalId: "a", sequence: 1, payload: "p", ts: "t" }),
    );
    expect(doc.state.global.entries).toHaveLength(1);
    expect(doc.state.global.entries[0]).toMatchObject({
      externalId: "a",
      status: "RECORDED",
      supersededBy: null,
    });
    expect(doc.state.global.watermark).toBe(1);
  });

  it("never regresses the watermark on an out-of-order (lower) sequence", () => {
    let doc = reducer(
      freshDoc(),
      recordEntry({ externalId: "hi", sequence: 5, payload: "p", ts: "t" }),
    );
    doc = reducer(
      doc,
      recordEntry({ externalId: "lo", sequence: 4, payload: "p", ts: "t" }),
    );
    expect(doc.state.global.watermark).toBe(5);
    expect(doc.state.global.entries.map((e) => e.externalId)).toEqual([
      "hi",
      "lo",
    ]);
  });

  it("rejects a duplicate externalId — op recorded with an error, state unchanged", () => {
    let doc = reducer(
      freshDoc(),
      recordEntry({ externalId: "a", sequence: 1, payload: "p", ts: "t" }),
    );
    doc = reducer(
      doc,
      recordEntry({ externalId: "a", sequence: 2, payload: "p2", ts: "t" }),
    );
    expect(doc.state.global.entries).toHaveLength(1);
    expect(doc.state.global.entries[0].payload).toBe("p");
    expect(doc.operations.global.at(-1)?.error).toBeDefined();
  });

  it("correction flips the original to SUPERSEDED and appends a new entry — no mutation", () => {
    let doc = reducer(
      freshDoc(),
      recordEntry({ externalId: "po-1", sequence: 1, payload: "$100", ts: "t1" }),
    );
    doc = reducer(
      doc,
      markSuperseded({
        supersededId: "po-1",
        externalId: "po-1-c",
        sequence: 2,
        payload: "$130",
        ts: "t2",
      }),
    );

    const entries = doc.state.global.entries;
    expect(entries).toHaveLength(2);

    const original = entries.find((e) => e.externalId === "po-1")!;
    const correction = entries.find((e) => e.externalId === "po-1-c")!;
    // Original payload is untouched — the correction is new history, not an edit.
    expect(original.payload).toBe("$100");
    expect(original.status).toBe("SUPERSEDED");
    expect(original.supersededBy).toBe("po-1-c");
    expect(correction.payload).toBe("$130");
    expect(correction.status).toBe("RECORDED");
    expect(doc.state.global.watermark).toBe(2);
  });

  it("rejects superseding an unknown entry — op recorded with an error", () => {
    const doc = reducer(
      freshDoc(),
      markSuperseded({
        supersededId: "ghost",
        externalId: "c",
        sequence: 1,
        payload: "x",
        ts: "t",
      }),
    );
    expect(doc.state.global.entries).toHaveLength(0);
    expect(doc.operations.global.at(-1)?.error).toBeDefined();
  });
});
