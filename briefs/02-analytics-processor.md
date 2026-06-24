# Recipe brief: analytics-processor

**One-liner:** A processor that maps document operations into the Powerhouse analytics
engine (`IAnalyticsStore` + `AnalyticsPath` dimensions) and a query layer that reads
time-series aggregations back out.

## Why this recipe

The analytics engine is an entire platform subsystem
(`@powerhousedao/analytics-engine-core`, `-pg`, `-browser`, `-graphql`, `-knex` in the
monorepo at `~/projects/powerhouse/powerhouse/packages/analytics-engine/`) with zero
recipe coverage. `contributor-billing` uses it in production to build spend analytics
from invoice line items. Existing read-model recipes (`custom-read-model`,
`relational-db-subgraph`) cover SQL projections; this covers the dedicated
time-series/dimensional store.

## What it demonstrates

- Implementing `IProcessor` (from `document-drive`) whose constructor receives an
  `IAnalyticsStore` (type exported by `@powerhousedao/reactor-api`).
- `onStrands(strands: InternalTransmitterUpdate[])` — consuming operation batches.
- `AnalyticsPath.fromString(...)` — hierarchical dimension paths (e.g.
  `ph/expenses/<docId>/<category>`).
- Idempotent reprocessing: clear all series for a source, then rebuild (the
  `clearSource` pattern).
- Querying aggregations (sum per dimension per period) via the analytics query engine.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__contributor-billing`**
  - `dist/processors/line-item-processor/index.d.ts` — verified shape:
    ```ts
    import { IAnalyticsStore } from "@powerhousedao/reactor-api";
    import { InternalTransmitterUpdate, IProcessor } from "document-drive";
    export declare class LineItemProcessorProcessor implements IProcessor {
        constructor(analyticsStore: IAnalyticsStore);
        onStrands<TDocument extends PHDocument>(strands: InternalTransmitterUpdate<TDocument>[]): Promise<void>;
        onDisconnect(): Promise<void>;
        private clearSource;
    }
    ```
  - `dist/processors/line-item-processor/index.js` — the implementation: builds
    `AnalyticsPath.fromString(...)` sources/dimensions from invoice line-item
    operations, clears the series for a document's source before re-adding values.
  - `dist/processors/factory.js` — how the processor is registered with a filter
    (document type / scope) and handed the analytics store.
- **Monorepo** `~/projects/powerhouse/powerhouse/packages/analytics-engine/` — store
  implementations: `core` (types + in-memory), `pg`/`knex` (Postgres), `browser`,
  `graphql` (ready-made query API). Pick the lightest store that runs in a demo
  (memory or PGlite-backed knex) so `pnpm start` needs no external services.

## Suggested shape

Standalone package `@powerhousedao/example-analytics-processor`.

- Minimal "expense report" document state: line items with `{ amount, currency,
  category, date }` (hand-rolled model or generic actions — match how `audit-trail`
  / `saga` build their fixtures).
- `processor.ts` — `IProcessor` mapping ADD/UPDATE/DELETE line-item operations into
  analytics series: source = `ph/example/<documentId>`, dimensions = `category`,
  `currency`; value = amount; metric = e.g. `Expenses`.
- `query.ts` — run 2–3 aggregations: total per category, monthly totals, one
  multi-dimension breakdown.
- `demo.ts` — boot a reactor (as `audit-trail`/`saga` do), seed a few documents,
  process, print query results as small tables.
- Tests: dedup on reprocess (run `onStrands` twice → same totals), source clearing,
  dimension path construction.

## Implementation notes & pitfalls

- **Idempotency is the heart of it**: a strand can be re-delivered from revision 0.
  Follow contributor-billing's `clearSource` approach — wipe series by source before
  rebuilding — and demonstrate it in a test.
- `AnalyticsPath` segments need escaping if user data (category names) flows into
  paths; sanitize or slugify.
- Be explicit about units: one series per currency, or normalize before storing —
  don't mix.
- Time comes from operation/action timestamps, not `Date.now()` at processing time.
- Check what the pinned catalog versions export: `IAnalyticsStore` is re-exported
  through `@powerhousedao/reactor-api` in the wild package; if the recipes catalog
  (now the 6.2.0-dev line) differs, depend on the analytics-engine packages directly.

## Related recipes in this repo

- `custom-read-model` and `relational-db-subgraph` — the SQL alternatives; the README
  should position analytics-engine vs. those (dimensional time-series vs. relational
  rows).
- `audit-trail` — same "processor + queryable store" skeleton to crib from.
