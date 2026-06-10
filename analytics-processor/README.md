# Analytics Processor

A Reactor processor that projects expense-report line items into the
Powerhouse analytics engine — a dedicated dimensional time-series store —
and a query layer that reads aggregations back out. Everything runs
in-process (the store is backed by PGlite, an embedded PostgreSQL), so the
demo needs no external services.

## What it demonstrates

- Implementing `IProcessor` (from `@powerhousedao/reactor`) whose constructor
  receives an `IAnalyticsStore`, registered through a `ProcessorFactory` with
  a document-type filter and `startFrom: "beginning"`.
- Mapping `ADD_LINE_ITEM` / `UPDATE_LINE_ITEM` / `DELETE_LINE_ITEM` operations
  into append-only series values: updates and deletes write **compensating
  entries** (−old, +new) instead of mutating history.
- **Idempotent reprocessing** — the `clearSource` pattern. A processor
  registered with `startFrom: "beginning"` can be re-delivered the full
  operation history at any time (e.g. after a restart). Seeing operation
  index 0 again for a known document means "replay": the processor clears
  that document's series (`clearSeriesBySource`) and rebuilds, so
  reprocessing always converges to the same totals.
- Building hierarchical `AnalyticsPath` dimensions from user data
  (slugified category names like `ph/expenses/category/headcount/salaries`).
- Querying with `AnalyticsQueryEngine`: totals per category, monthly
  aggregation, and a category × currency breakdown using `lod`
  (level of detail) to roll subcategories up into their parents.
- A document model generated with `ph generate` from a spec JSON
  (`document-models/expense-report/expense-report.json`), the same workflow
  as the `role-based-auth` recipe.

## When to use the analytics engine vs a SQL read model

|  | analytics-processor (this recipe) | custom-read-model | relational-db-subgraph |
|---|---|---|---|
| Storage model | Dimensional time-series (source, metric, dimensions, unit) | In-memory map | Relational rows (Kysely schema) |
| Query style | Time-bucketed aggregates, dimension rollups via `lod` | Direct lookup | Arbitrary SQL: joins, filters, ordering |
| Best for | "Total per category per month in USD" — dashboards, budgets, spend analytics | Simple derived counts | Searchable catalogs, tag filters |

Use the analytics engine when queries are shaped like *aggregate metric X,
grouped by dimension Y, over period Z, rolled up to depth N*. Use
`relational-db-subgraph` when you need relational queries, and
`custom-read-model` for lightweight synchronous counters.

## Key concepts

- **Source** — an `AnalyticsPath` identifying who owns a set of series. This
  recipe uses one source per document (`ph/expenses/<documentId>`), so a
  single `clearSeriesBySource(source, true)` wipes exactly that document
  during a replay.
- **Dimensions** — named `AnalyticsPath`s attached to every value
  (`category`, `currency` here). Queries `select` on dimension path prefixes
  and group by the (lod-truncated) paths.
- **Metric + unit** — the metric is a plain string (`"Expenses"`); the unit
  carries the currency code. One series per currency — the engine never sums
  across units, which keeps USD and EUR amounts separate.
- **Business time vs event time** — series values are dated by the line
  item's `date` field (when the money was spent), not by the operation
  timestamp and never by processing time. A correction made in March to a
  January expense still lands in January.
- **lod (level of detail)** — truncates dimension paths to N segments at
  query time: `lod: { category: 4 }` collapses
  `ph/expenses/category/headcount/salaries` into
  `ph/expenses/category/headcount`. Every key in `select` needs a `lod`
  entry.
- **Explicit query windows** — the engine can derive a missing start/end
  from the data, but it is fragile on degenerate inputs; the query layer
  always passes an explicit window.

## Files

| File | Purpose |
|---|---|
| `document-models/expense-report/` | Generated document model (`example/expense-report`); reducers in `v1/src/`, spec in `expense-report.json` |
| `src/processor.ts` | `ExpenseAnalyticsProcessor`, path helpers, processor factory |
| `src/query.ts` | Query functions over `AnalyticsQueryEngine` + table rendering |
| `src/demo.ts` | End-to-end demo |
| `src/processor.test.ts` | Processor tests against a real PGlite-backed store |

## Setup

```sh
pnpm install
pnpm build
```

## Running the demo

```sh
pnpm start
```

Boots a reactor, creates three expense reports, dispatches nine adds, one
amount correction, and one delete, waits for the processor via the
processor-manager consistency tracker (no sleeps), then prints three
aggregation tables.

## Tests

```sh
pnpm test
```

Covers the delta arithmetic (add/update/delete, date-moving updates),
idempotent replay (same operations delivered twice → same totals), source
clearing isolation between documents, slug escaping of hostile category
names, currency separation, and skipping of failed operations.

## Regenerating the document model

```sh
pnpm generate document-model --document document-models/expense-report/expense-report.json
```

Requires the Powerhouse monorepo checked out next to this repo (the script
calls `../../powerhouse/clis/ph-cli/dist/cli.mjs`). Note that the generated
output targets a newer `document-model` than the catalog pin; a few imports
are adjusted to the `document-model/core` subpath (marked with comments) and
`v1/hooks.ts` (which requires `@powerhousedao/reactor-browser`) is removed.

## License

AGPL-3.0-only
