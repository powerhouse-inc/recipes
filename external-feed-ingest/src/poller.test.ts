import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ReactorBuilder,
  JobAwaiter,
  type IEventBus,
  type IReactor,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createFeedLedgerDocument,
  FeedLedger,
  type FeedLedgerDocument,
} from "document-models/feed-ledger/v1";
import { MockFeed, scriptedFeed, type FeedEvent } from "./feed.js";
import { FeedPoller, type Feed } from "./poller.js";

let reactor: IReactor;
let eventBus: IEventBus;
let awaiter: JobAwaiter;

async function freshLedger(source: string): Promise<string> {
  const doc = createFeedLedgerDocument({ global: { source } });
  const job = await reactor.create(doc);
  await awaiter.waitForJob(job.id);
  return doc.header.id;
}

function entriesOf(doc: FeedLedgerDocument) {
  return doc.state.global.entries;
}

beforeEach(async () => {
  // Fresh reactor per test so document state never leaks between cases.
  const built = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      FeedLedger,
    ])
    .buildModule();
  reactor = built.reactor;
  eventBus = built.eventBus;
  awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
});

afterAll(() => {
  awaiter?.shutdown();
  reactor?.kill();
});

describe("FeedPoller", () => {
  it("ingests the scripted feed: normal, out-of-order, dedup, correction", async () => {
    const documentId = await freshLedger("invoices");
    const poller = new FeedPoller(reactor, eventBus, documentId, scriptedFeed());
    await poller.seedFromState();
    const result = await poller.pollOnce();
    poller.shutdown();

    // po-002 is redelivered (seq 4) — recorded once, the redelivery skipped.
    expect(result.recorded).toEqual(["po-001", "po-002", "po-003", "po-004", "po-001-c"]);
    expect(result.skippedDuplicates).toEqual(["po-002"]);
    expect(result.superseded).toEqual(["po-001"]);

    const doc = await reactor.get<FeedLedgerDocument>(documentId);
    const ids = entriesOf(doc).map((e) => e.externalId);
    expect(ids.filter((id) => id === "po-002")).toHaveLength(1);
    expect(doc.state.global.watermark).toBe(6);
  });

  it("does not double-ingest across a poller restart (state is the checkpoint)", async () => {
    const documentId = await freshLedger("invoices");
    const feed = scriptedFeed();

    // Poller #1 sees only cursors 1–3, then "crashes".
    const truncated: Feed = {
      fetchSince: async (since) =>
        (await feed.fetchSince(since)).filter((e) => e.sequence <= 3),
    };
    const p1 = new FeedPoller(reactor, eventBus, documentId, truncated);
    await p1.seedFromState();
    const r1 = await p1.pollOnce();
    p1.shutdown();
    expect(r1.recorded).toEqual(["po-001", "po-002", "po-003"]);

    // Poller #2 is a fresh instance — no in-memory carryover. It re-seeds from
    // the document and sees the full feed (incl. the po-002 redelivery).
    const p2 = new FeedPoller(reactor, eventBus, documentId, feed);
    await p2.seedFromState();
    expect(p2.currentWatermark).toBe(3);
    expect(p2.seenCount).toBe(3);
    const r2 = await p2.pollOnce();
    p2.shutdown();

    // The already-recorded ids are NOT ingested again.
    expect(r2.recorded).toEqual(["po-004", "po-001-c"]);
    expect(r2.skippedDuplicates).toEqual(["po-002"]);

    const doc = await reactor.get<FeedLedgerDocument>(documentId);
    const ids = entriesOf(doc).map((e) => e.externalId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates at all
    expect(ids.filter((id) => id === "po-002")).toHaveLength(1);
  });

  it("a redelivery already in seeded state is skipped, never re-applied", async () => {
    const documentId = await freshLedger("invoices");
    // Seed the document with po-002 already present.
    const seedFeed: Feed = {
      fetchSince: async () => [
        { externalId: "po-002", sequence: 2, payload: "v", ts: "t" },
      ],
    };
    const warm = new FeedPoller(reactor, eventBus, documentId, seedFeed);
    await warm.seedFromState();
    await warm.pollOnce();
    warm.shutdown();

    // A brand-new poller re-seeds, then the feed redelivers po-002 at a LATER
    // cursor (seq 9 > watermark 2) — it passes the watermark filter but is
    // caught by the externalId dedup.
    const redeliver: Feed = {
      fetchSince: async () => [
        { externalId: "po-002", sequence: 9, payload: "v", ts: "t" },
      ],
    };
    const p = new FeedPoller(reactor, eventBus, documentId, redeliver);
    await p.seedFromState();
    const r = await p.pollOnce();
    p.shutdown();

    expect(r.recorded).toEqual([]);
    expect(r.skippedDuplicates).toEqual(["po-002"]);
    const doc = await reactor.get<FeedLedgerDocument>(documentId);
    expect(entriesOf(doc)).toHaveLength(1);
  });

  it("correction produces a markSuperseded op, not a mutated entry", async () => {
    const documentId = await freshLedger("invoices");
    const poller = new FeedPoller(reactor, eventBus, documentId, scriptedFeed());
    await poller.seedFromState();
    await poller.pollOnce();
    poller.shutdown();

    const ops = await reactor.getOperations(documentId);
    const domain = (ops.global?.results ?? []).filter((op) =>
      ["RECORD_ENTRY", "MARK_SUPERSEDED"].includes(op.action.type),
    );
    expect(domain.filter((op) => op.action.type === "MARK_SUPERSEDED")).toHaveLength(1);

    const doc = await reactor.get<FeedLedgerDocument>(documentId);
    const original = entriesOf(doc).find((e) => e.externalId === "po-001")!;
    expect(original.payload).toBe("Invoice #001 — $100"); // never mutated
    expect(original.status).toBe("SUPERSEDED");
  });

  it("backs off on a feed error instead of tight-looping", async () => {
    const documentId = await freshLedger("invoices");
    // Feed throws once at cursor 0 (the first fetch), then succeeds.
    const feed = new MockFeed(
      [{ externalId: "x", sequence: 1, payload: "p", ts: "t" } as FeedEvent],
      { failOnceAtCursor: [0] },
    );
    const poller = new FeedPoller(reactor, eventBus, documentId, feed);
    await poller.seedFromState();

    // pollOnce surfaces the transient error to the caller...
    await expect(poller.pollOnce()).rejects.toThrow(/transient/);
    // ...and a retry succeeds.
    const r = await poller.pollOnce();
    poller.shutdown();
    expect(r.recorded).toEqual(["x"]);
  });
});
