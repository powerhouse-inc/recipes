# External Feed Ingest

A polling worker that pulls an off-platform feed into event-sourced documents
**idempotently**. The trigger comes from outside the reactor, the
`@powerhousedao/reactor` instance that stores the documents and applies
operations to them. A deterministic in-process mock feed replaces the chain a
production poller would page ([the brief](../briefs/05-external-feed-ingest.md)
describes that poller), so the demo runs offline with no keys.

## Where the checkpoint lives

> **The document is the checkpoint store.** The dedup set and the high-watermark
> live in document state, and the worker rebuilds them at startup. An
> in-memory-only checkpoint re-ingests everything since the last flush when the
> worker dies mid-stream. A state-seeded restart re-ingests nothing.

```
external feed ──fetchSince(watermark)──▶ FeedPoller
   (monotonic cursor,                       │  1. seedFromState(): rebuild dedup set
    redeliveries,                           │     + watermark from the document
    corrections)                            │  2. skip ids already in state
                                            │  3. map event → recordEntry / markSuperseded
                                            ▼
                                    reactor.execute → Ledger document
                                       { source, watermark, entries[] }
```

## What it demonstrates

- **A poll loop** dispatching actions into a document through the reactor
  (`FeedPoller.pollOnce`, or `start` for the interval version, which backs off
  exponentially on errors).
- **Corrections as explicit operations.** An upstream rewrite becomes a
  `markSuperseded` op that flips the old entry's status and appends the
  corrected value as a *new* entry. The original payload is never mutated.

## Why `externalId` is the dedup key, not the watermark

The watermark is only a *fetch optimization* ("don't re-read the whole feed"),
**not** the dedup mechanism. Real feeds redeliver: the same `externalId` can
reappear at a *later* cursor, and a watermark filter lets it through. The
authoritative check is "have I already recorded this `externalId`?", answered
from the document state of that source.

The scripted feed (`feed.ts`) exercises each case: an out-of-order `ts`, a
redelivery of `po-002`, and a correction of `po-001`.

## Run it

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest start
```

The demo ingests the first three events, **kills the poller** (discarding its
in-memory cache), then starts a fresh one that re-seeds from the document and
drains the rest. The demo prints the final ledger, the operation history, and
three checks: no duplicate across the restart, the correction recorded as
`MARK_SUPERSEDED` plus a new entry, and `po-001`'s payload intact.

## The document model

The `FeedLedger` model is generated from
`document-models/feed-ledger/feed-ledger.json`. The reducer is hand-maintained
at `document-models/feed-ledger/v1/src/reducers/ingest.ts`:

- `recordEntry` appends a `RECORDED` entry stamped with the feed's `ts`, never
  local wall-clock, and advances the watermark to `max(watermark, sequence)`, so
  an out-of-order delivery can't regress it. Throws `DuplicateEntry` if the
  `externalId` is already present.
- `markSuperseded` flips an existing entry to `SUPERSEDED`, sets its
  `supersededBy`, and appends the correction as a new `RECORDED` entry,
  advancing the watermark the same way. Throws `UnknownEntry` if the target is
  missing or already superseded.

## Tests

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest test
```

`document-models/feed-ledger/v1/tests/ingest.test.ts` covers the reducer,
`src/poller.test.ts` the poller end-to-end over a reactor.

## Related recipes

- [`inbound-webhook-bridge`](../inbound-webhook-bridge): the *push* twin. The
  feed calls you, same idempotency idea.
- [`cross-document-reactor`](../cross-document-reactor) / [`saga`](../saga):
  the same automation driven by *internal* events.
