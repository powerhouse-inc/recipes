/**
 * A deterministic, in-process mock of an external feed.
 *
 * Real feeds (Alchemy's `alchemy_getAssetTransfers`, a Stripe events list, a
 * webhook backfill API) share a shape this mock reproduces:
 *
 *   - You page by a monotonic **delivery cursor** (`sequence` here; a block
 *     number / `next_page` token in real life). The cursor only ever moves
 *     forward, even when the underlying events don't.
 *   - The cursor is NOT the logical order. An event's business timestamp
 *     (`ts`) can be older than one delivered before it — upstream batching,
 *     clock skew, and backfills all cause this.
 *   - Providers **redeliver**. The same `externalId` can appear at more than
 *     one cursor position (at-least-once delivery).
 *   - Upstream sometimes **corrects** an earlier event (a reorg, a restated
 *     figure). The mock models this with a `corrects` field pointing at the
 *     externalId being replaced.
 *
 * The dedup key the consumer must rely on is `externalId`, never `sequence`.
 */
export type FeedEvent = {
  /** Stable upstream id — the dedup key. */
  externalId: string;
  /** Monotonic delivery cursor. The high-watermark tracks this. */
  sequence: number;
  payload: string;
  /** Logical (business) timestamp — may be out of order vs `sequence`. */
  ts: string;
  /** When set, this event corrects the entry with that externalId. */
  corrects?: string;
};

export class MockFeed {
  /** Delivery log in cursor order. */
  private readonly log: FeedEvent[];
  /** Cursors at which `fetchSince` should throw, to exercise backoff. */
  private readonly failAt: Set<number>;
  private readonly failed = new Set<number>();

  constructor(log: FeedEvent[], opts: { failOnceAtCursor?: number[] } = {}) {
    // Defensive copy, sorted by the delivery cursor.
    this.log = [...log].sort((a, b) => a.sequence - b.sequence);
    this.failAt = new Set(opts.failOnceAtCursor ?? []);
  }

  /**
   * Return every event with `sequence > since`, in cursor order. This is the
   * paging primitive a poller drives: "give me everything after my watermark".
   *
   * If a transient failure is scripted for this `since` value, the first call
   * throws and subsequent calls succeed — so a consumer's backoff/retry can be
   * exercised deterministically.
   */
  async fetchSince(since: number): Promise<FeedEvent[]> {
    if (this.failAt.has(since) && !this.failed.has(since)) {
      this.failed.add(since);
      throw new Error(`feed transient error at cursor ${since}`);
    }
    return this.log.filter((e) => e.sequence > since);
  }

  /** Highest cursor in the feed — handy for demos/tests to know when drained. */
  get maxSequence(): number {
    return this.log.length === 0 ? 0 : this.log[this.log.length - 1].sequence;
  }
}

/**
 * The scripted feed used by the demo and tests. Deliberately small but covers
 * every case the recipe exists to handle:
 *
 *   seq 1  po-001            normal
 *   seq 2  po-002            normal
 *   seq 3  po-003            normal — but its `ts` is EARLIER than po-002's
 *                            (out-of-order logical delivery)
 *   seq 4  po-002 (again)    DUPLICATE redelivery at a later cursor
 *   seq 5  po-004            normal
 *   seq 6  po-001-c          CORRECTION of po-001 (restated amount)
 */
export function scriptedFeed(opts?: { failOnceAtCursor?: number[] }): MockFeed {
  return new MockFeed(
    [
      {
        externalId: "po-001",
        sequence: 1,
        payload: "Invoice #001 — $100",
        ts: "2026-06-01T08:00:00.000Z",
      },
      {
        externalId: "po-002",
        sequence: 2,
        payload: "Invoice #002 — $250",
        ts: "2026-06-01T08:05:00.000Z",
      },
      {
        externalId: "po-003",
        sequence: 3,
        payload: "Invoice #003 — $90",
        // Out-of-order: logically precedes po-002, delivered after it.
        ts: "2026-06-01T07:55:00.000Z",
      },
      {
        externalId: "po-002",
        sequence: 4,
        payload: "Invoice #002 — $250",
        ts: "2026-06-01T08:05:00.000Z",
      },
      {
        externalId: "po-004",
        sequence: 5,
        payload: "Invoice #004 — $300",
        ts: "2026-06-01T08:12:00.000Z",
      },
      {
        externalId: "po-001-c",
        sequence: 6,
        payload: "Invoice #001 — $130 (restated)",
        ts: "2026-06-01T09:00:00.000Z",
        corrects: "po-001",
      },
    ],
    opts,
  );
}
