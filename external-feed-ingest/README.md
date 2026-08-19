# External Feed Ingest

A polling worker that pulls an off-platform feed into event-sourced documents
**idempotently**. It is the external-input counterpart to
[`cross-document-reactor`](../cross-document-reactor) (which automates on
*internal* events): here the trigger comes from outside the reactor, the
`@powerhousedao/reactor` instance that stores the documents and applies
operations to them.

This generalizes what `defi-united-package` does for real against Ethereum.
That package is production code outside this repo, not a sibling recipe. Its
`onchain-receipt-watcher` processor polls Alchemy's
`alchemy_getAssetTransfers` and dispatches `RECORD_RECEIPT` actions into
receipt documents, handling idempotency, confirmation depth, and chain reorgs
as first-class concerns. We replace Ethereum with a deterministic in-process
mock feed so the recipe is keyless and offline-runnable.

## The one idea worth taking away

> **The document is the checkpoint store.** The dedup set and the high-watermark
> live in document state, and the worker rebuilds them from state at startup. An
> in-memory-only checkpoint is the bug this recipe exists to prevent: crash the
> worker mid-stream and an in-memory checkpoint re-ingests everything since the
> last flush. Seed from state instead and a restart is a no-op.

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
  (`FeedPoller.pollOnce` / `start`).
- **Idempotent ingestion.** The dedup key is `(source, externalId)`, checked in
  the poller against state and enforced again in the reducer, which throws
  `DuplicateEntry`.
- **High-watermark per source, stored in the document itself.** No side
  database. The watermark tracks the feed's monotonic *delivery cursor*, not the
  events' logical timestamps.
- **Corrections as explicit operations.** An upstream rewrite becomes a
  `markSuperseded` op that flips the old entry's status and appends the corrected
  value as a *new* entry. The original payload is never mutated.

## Why `externalId` is the dedup key, not the watermark

The watermark is only a *fetch optimization* ("don't re-read the whole feed").
It is **not** the dedup mechanism, because real feeds redeliver: the same
`externalId` can reappear at a *later* cursor, sailing straight past a
watermark filter. The authoritative check is "have I already recorded this
`externalId`?", answered from document state. The watermark and the id-set are
belt and suspenders.

The scripted feed (`feed.ts`) exercises every case in six events:

| cursor | externalId | what it is |
|--------|------------|-----------|
| 1 | `po-001` | normal |
| 2 | `po-002` | normal |
| 3 | `po-003` | normal, but its `ts` is *earlier* than `po-002`'s (out-of-order logical delivery) |
| 4 | `po-002` | **duplicate** redelivery at a later cursor |
| 5 | `po-004` | normal |
| 6 | `po-001-c` | **correction** of `po-001` (restated amount) |

## Run it

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest start
```

The demo starts a poller, lets it ingest the first three events, **kills it**
(discarding its in-memory cache), then starts a *fresh* poller that re-seeds
from the document and drains the rest. It prints the final ledger and operation
history, and asserts:

- no duplicate entries across the restart (`po-002` appears exactly once),
- the correction is a `MARK_SUPERSEDED` op + a new entry, and
- `po-001`'s original payload was never mutated.

## The document model (codegen)

The `FeedLedger` document model is **generated**, not hand-written. The spec
lives at `document-models/feed-ledger/feed-ledger.json` (GraphQL state schema +
operations + initial reducer bodies). Everything under
`document-models/feed-ledger/v1/gen/` is produced from it: types, zod
validators, action creators, the reducer wiring, and the typed error classes
(`DuplicateEntry`, `UnknownEntry`). Regenerate after editing the spec:

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest generate
```

The state schema:

```graphql
type FeedLedgerState {
  source: String!
  watermark: Int!
  entries: [LedgerEntry!]!
}
type LedgerEntry {
  externalId: String!
  sequence: Int!
  payload: String!
  recordedAt: String!          # the FEED timestamp, never local wall-clock
  status: LedgerEntryStatus!   # RECORDED | SUPERSEDED
  supersededBy: String
}
enum LedgerEntryStatus { RECORDED SUPERSEDED }
```

The reducer logic is hand-maintained at
`document-models/feed-ledger/v1/src/reducers/ingest.ts` (codegen scaffolds it
from the spec's `reducer` fields and then leaves it alone):

- `recordEntry(externalId, sequence, payload, ts)`: append a `RECORDED` entry
  and advance the watermark to `max(watermark, sequence)` (monotonic, so an
  out-of-order delivery can't regress it). Throws `DuplicateEntry` if the
  `externalId` is already present.
- `markSuperseded(supersededId, externalId, sequence, payload, ts)`: flip an
  existing entry to `SUPERSEDED`, set its `supersededBy`, and append the
  correction as a new `RECORDED` entry. Throws `UnknownEntry` if the target is
  missing or already superseded.

Watermark advancement is folded into both operations. There is no separate
`setWatermark` op.

The `ph-cli` devDependency uses `catalog:`, so codegen tracks the same runtime
line as everything else in the workspace and the `gen/` tree compiles as-is.

## Where should the poller live?

This recipe runs the poller as a **plain long-running script** using the reactor
client (no reactor-managed lifecycle, matching `cross-document-reactor`'s
style). The `start(intervalMs)` loop backs off exponentially on feed errors and
never tight-loops a struggling upstream.

The alternative is to run the poll inside an `IProcessor` (from
`@powerhousedao/reactor`), which is `defi-united-package`'s choice. It's
perfectly valid, but then the reactor owns the worker's lifecycle
(start/stop/retry), which is more machinery than a recipe needs to make the
point. The crash-safety argument is identical either way: it comes from
seeding state from the document, not from where the loop lives.

One document per source keeps watermark advancement contention-free: every
`recordEntry` touches a single document, so there's no cross-source coordination.

## Tests

```sh
pnpm --filter @powerhousedao/example-external-feed-ingest test
```

- `document-models/feed-ledger/v1/tests/ingest.test.ts` covers the reducer:
  record, monotonic watermark, duplicate rejection, correction-not-mutation,
  unknown-supersede rejection.
- `src/poller.test.ts` runs end-to-end over a reactor: full scripted ingest,
  **restart-without-duplicates**, redelivery-ignored, correction →
  `markSuperseded`, and backoff-on-feed-error.

## Related recipes

- [`cross-document-reactor`](../cross-document-reactor) / [`saga`](../saga):
  internal-event automation. This is the external-input counterpart.
- [`inbound-webhook-bridge`](../inbound-webhook-bridge): the *push* twin. The
  feed calls you. Same idempotency idea (dedup ids in document state), different
  trigger.
- [`sync-health-monitor`](../sync-health-monitor): similar long-running observer
  wiring.
- [`batch-progress`](../batch-progress): bulk dispatch ergonomics if the feed
  delivers in batches.
