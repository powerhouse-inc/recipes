import type { Action } from "document-model";
import {
  JobAwaiter,
  JobStatus,
  type IEventBus,
  type IReactor,
} from "@powerhousedao/reactor";
import type { FeedEvent } from "./feed.js";
import {
  markSuperseded,
  recordEntry,
  type FeedLedgerDocument,
} from "document-models/feed-ledger/v1";

/** The minimal feed surface the poller needs — easy to mock in tests. */
export interface Feed {
  fetchSince(since: number): Promise<FeedEvent[]>;
}

export type PollResult = {
  /** externalIds appended as new RECORDED entries (incl. corrections). */
  recorded: string[];
  /** externalIds flipped to SUPERSEDED by a correction. */
  superseded: string[];
  /** externalIds the feed redelivered that were already in state. */
  skippedDuplicates: string[];
  /** In-memory watermark after this poll. */
  watermark: number;
};

export type StartOptions = {
  intervalMs: number;
  /** Backoff ceiling after repeated feed errors. Default 30s. */
  maxBackoffMs?: number;
  onError?: (err: unknown) => void;
  onPoll?: (result: PollResult) => void;
};

/**
 * A polling worker that ingests an external {@link Feed} into a ledger document
 * idempotently.
 *
 * It holds NO durable state of its own — only a warm in-memory cache seeded
 * from the document at startup ({@link FeedPoller.seedFromState}). The document
 * is the checkpoint store, which is what makes the worker crash-safe: kill it,
 * start a fresh one, and it resumes from the persisted watermark with the
 * persisted set of externalIds, so nothing is double-ingested.
 */
export class FeedPoller {
  private readonly awaiter: JobAwaiter;
  /** Warm cache of externalIds already in the document. NOT the source of truth. */
  private seen = new Set<string>();
  /** Highest feed cursor consumed in this session. */
  private watermark = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly reactor: IReactor,
    eventBus: IEventBus,
    private readonly documentId: string,
    private readonly feed: Feed,
    private readonly branch = "main",
  ) {
    this.awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
  }

  /**
   * Rebuild the in-memory dedup set and watermark from PERSISTED document
   * state. Call this once before polling. This single line is the recipe: an
   * in-memory-only checkpoint is the bug this pattern exists to prevent.
   */
  async seedFromState(): Promise<void> {
    const doc = await this.reactor.get<FeedLedgerDocument>(this.documentId);
    this.watermark = doc.state.global.watermark;
    this.seen = new Set(doc.state.global.entries.map((e) => e.externalId));
  }

  get currentWatermark(): number {
    return this.watermark;
  }

  get seenCount(): number {
    return this.seen.size;
  }

  /**
   * Fetch everything past the watermark, dispatch one action per genuinely-new
   * event, and skip redeliveries. Throws if the reactor rejects an op (so the
   * loop can back off and retry rather than skip past it).
   */
  async pollOnce(): Promise<PollResult> {
    const events = await this.feed.fetchSince(this.watermark);
    const result: PollResult = {
      recorded: [],
      superseded: [],
      skippedDuplicates: [],
      watermark: this.watermark,
    };

    for (const event of events) {
      // Authoritative dedup is by externalId against state, NOT by watermark.
      // A provider redelivery shows up at a *later* cursor, so it passes the
      // watermark filter — this is the check that actually stops it.
      if (this.seen.has(event.externalId)) {
        result.skippedDuplicates.push(event.externalId);
        this.watermark = Math.max(this.watermark, event.sequence);
        continue;
      }

      const isCorrection = !!event.corrects && this.seen.has(event.corrects);
      const action: Action = isCorrection
        ? markSuperseded({
            supersededId: event.corrects!,
            externalId: event.externalId,
            sequence: event.sequence,
            payload: event.payload,
            ts: event.ts,
          })
        : recordEntry({
            externalId: event.externalId,
            sequence: event.sequence,
            payload: event.payload,
            ts: event.ts,
          });

      const job = await this.reactor.execute(this.documentId, this.branch, [
        action,
      ]);
      const info = await this.awaiter.waitForJob(job.id);
      if (info.status === JobStatus.FAILED) {
        // Don't advance past an event we failed to apply — surface it so the
        // caller (or the backoff loop) retries on the next poll.
        throw new Error(
          `reactor rejected ${event.externalId}: ${info.error?.message ?? "job failed"}`,
        );
      }

      // Commit to the warm cache only after the op is durably applied.
      this.seen.add(event.externalId);
      result.recorded.push(event.externalId);
      if (isCorrection) {
        result.superseded.push(event.corrects!);
      }
      this.watermark = Math.max(this.watermark, event.sequence);
    }

    result.watermark = this.watermark;
    return result;
  }

  /**
   * Run {@link pollOnce} on an interval. On a feed error the delay grows
   * exponentially (capped) and resets on the next success — never a tight
   * retry loop against a struggling upstream.
   */
  start(opts: StartOptions): void {
    this.stopped = false;
    const maxBackoff = opts.maxBackoffMs ?? 30_000;
    let delay = opts.intervalMs;

    const tick = async () => {
      if (this.stopped) return;
      try {
        const result = await this.pollOnce();
        opts.onPoll?.(result);
        delay = opts.intervalMs; // healthy poll → back to the base cadence
      } catch (err) {
        opts.onError?.(err);
        delay = Math.min(maxBackoff, delay * 2);
      }
      if (!this.stopped) {
        this.timer = setTimeout(() => void tick(), delay);
      }
    };

    this.timer = setTimeout(() => void tick(), opts.intervalMs);
  }

  /** Stop the interval loop. The document state is untouched. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Stop and release the job awaiter. */
  shutdown(): void {
    this.stop();
    this.awaiter.shutdown();
  }
}
