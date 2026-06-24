# Recipe brief: external-feed-ingest

**One-liner:** A polling worker that ingests an external feed into documents
idempotently — dedup keys seeded from existing state, a per-source high-watermark, and
explicit correction operations for upstream rewrites.

## Why this recipe

Pulling off-platform data into event-sourced documents is a recurring need and nobody
shows how to do it safely. `defi-united-package` does it for real against Ethereum: a
processor polls Alchemy for asset transfers, prices them via Chainlink, and dispatches
`RECORD_RECEIPT` actions into receipt documents — with idempotency, confirmation
depth, and blockchain reorgs all handled as first-class concerns. The recipe
generalizes that to any feed.

## What it demonstrates

- A poll loop dispatching actions into documents through the reactor client.
- Idempotent ingestion: dedup set keyed by `(source, externalId)`, **seeded from
  existing document state at startup** so restarts don't double-ingest.
- High-watermark tracking per source, stored in document state itself (the document is
  the checkpoint store — no side database).
- Upstream corrections modeled as explicit operations (`markSuperseded` /
  `markReorged`), not silent edits.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`defi-united-package`** — the production blueprint.
  - `dist/processors/onchain-receipt-watcher/index.js` + `index.d.ts` — verified:
    polls `alchemy_getAssetTransfers` per active treasury, prices via the Chainlink
    ETH/USD feed, dispatches `RECORD_RECEIPT` actions. Idempotency via an in-memory
    `Set<"chainId:txHash:uniqueId">` seeded from existing receipt documents at
    startup; per-treasury high-watermark; confirmation-depth threshold before
    ingesting.
  - `dist/processors/onchain-receipt-watcher/eth-rpc.d.ts` — the thin RPC client
    surface.
  - `dist/document-models/onchain-receipt/v1/gen/schema/types.d.ts` — verified
    reconciliation state machine: `ReconciliationStatus = AMBIGUOUS |
    MANUALLY_OVERRIDDEN | MATCHED | REORGED | UNMATCHED`, with operations
    `recordReceipt`, `attachPledge`, `overrideMatch`, `markAmbiguous`, `markReorged` —
    reorgs (upstream history rewrites) are modeled, not ignored.
  - `dist/processors/pledge-reconciliation/index.d.ts` — companion processor that
    auto-matches new receipts to `Pledge` documents (cross-document reaction; overlaps
    with the existing `saga`/`cross-document-reactor` recipes, mention but don't
    duplicate).

## Suggested shape

Standalone package `@powerhousedao/example-external-feed-ingest`. Keep it keyless and
offline-runnable: replace Ethereum with a deterministic mock feed.

- `feed.ts` — an in-process mock feed server (or plain async generator) emitting
  events `{ id, sequence, payload, ts }`, scripted to include: normal events,
  duplicates, an out-of-order delivery, and a correction of an earlier event.
- "Ledger" document model: `{ entries: { externalId, payload, status: RECORDED |
  SUPERSEDED }[], watermark: number }` with operations `recordEntry`,
  `markSuperseded`, `setWatermark` (or fold watermark into `recordEntry`).
- `poller.ts` — interval loop: read watermark from document state → fetch feed since
  watermark → filter ids already present in state → dispatch actions. No state of its
  own beyond a warm cache.
- `demo.ts` — run the poller over the scripted feed, kill and restart it mid-stream,
  print final entries + operation history proving no duplicates and a visible
  correction op.
- Tests: restart-without-duplicates, duplicate-delivery ignored, correction produces
  `markSuperseded` not a mutated entry.

## Implementation notes & pitfalls

- **The document is the source of truth for progress.** Seeding the dedup set and
  watermark from state at startup is what makes the worker crash-safe; an in-memory-only
  checkpoint is the bug this recipe exists to prevent.
- Use feed timestamps in operation inputs, not local wall-clock.
- Backoff on feed errors; never tight-loop.
- Decide and document where the poller lives: a plain long-running script using the
  reactor client (simplest, matches `cross-document-reactor`'s style) vs. inside an
  `IProcessor` (defi-united's choice — fine, but lifecycle is owned by the reactor).
  Recommend the script for the recipe; note the processor variant.
- One document per source keeps watermark contention simple; say so.

## Related recipes in this repo

- `cross-document-reactor` / `saga` — internal-event automation; this recipe is the
  external-input counterpart.
- `sync-health-monitor` — similar long-running observer wiring.
- `batch-progress` — bulk dispatch ergonomics if the feed delivers in batches.
