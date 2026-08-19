# Analytics Processor

A Reactor processor that projects expense-report line items into the
Powerhouse analytics engine (a dedicated dimensional time-series store)
and a query layer that reads aggregations back out. Everything runs
in-process (the store is backed by PGlite, an embedded PostgreSQL), so the
demo needs no external services.

## What it demonstrates

- Implementing `IProcessor` (from `@powerhousedao/reactor`) as
  `ExpenseAnalyticsProcessor` in `src/processor.ts`, whose constructor
  receives an `IAnalyticsStore`, registered through a `ProcessorFactory` with
  a document-type filter and `startFrom: "beginning"`.
- Mapping `ADD_LINE_ITEM` / `UPDATE_LINE_ITEM` / `DELETE_LINE_ITEM` operations
  into append-only series values: updates and deletes write **compensating
  entries** (−old, +new) instead of mutating history.
- **Idempotent reprocessing** via the `clearSource` pattern. A processor
  registered with `startFrom: "beginning"` can be re-delivered the full
  operation history at any time (e.g. after a restart). Seeing operation
  index 0 again for a known document means "replay": the processor clears
  that document's series (`clearSeriesBySource`) and rebuilds, so
  reprocessing always converges to the same totals.
- Building hierarchical `AnalyticsPath` dimensions from user data
  (`categoryPathFor` slugifies category names into paths like
  `ph/expenses/category/headcount/salaries`).
- Querying with `AnalyticsQueryEngine` (`src/query.ts`, which also renders
  the demo's tables): totals per category, monthly aggregation, and a
  category × currency breakdown using `lod` (level of detail) to roll
  subcategories up into their parents.
- A document model (`example/expense-report`) generated with `ph generate`
  from a spec JSON (`document-models/expense-report/expense-report.json`)
  with reducers in `document-models/expense-report/v1/src/`, the same
  workflow as the `role-based-auth` recipe.

## When to use the analytics engine vs a SQL read model

|  | analytics-processor (this recipe) | custom-read-model | relational-db-subgraph |
|---|---|---|---|
| Storage model | Dimensional time-series (source, metric, dimensions, unit) | In-memory map | Relational rows (Kysely schema) |
| Query style | Time-bucketed aggregates, dimension rollups via `lod` | Direct lookup | Arbitrary SQL: joins, filters, ordering |
| Best for | "Total per category per month in USD" (dashboards, budgets, spend analytics) | Simple derived counts | Searchable catalogs, tag filters |

Use the analytics engine when queries are shaped like *aggregate metric X,
grouped by dimension Y, over period Z, rolled up to depth N*.

## Key concepts

- **Source**: an `AnalyticsPath` identifying who owns a set of series. This
  recipe uses one source per document (`ph/expenses/<documentId>`), which is
  why the replay clear above is a single `clearSeriesBySource(source, true)`.
- **Dimensions**: named `AnalyticsPath`s attached to every value
  (`category`, `currency` here). Queries `select` on dimension path prefixes
  and group by the (lod-truncated) paths.
- **Metric + unit**: the metric is a plain string (`"Expenses"`) and the
  unit carries the currency code. One series per currency, so the engine
  never sums across units, which keeps USD and EUR amounts separate.
- **Business time vs event time**: series values are dated by the line
  item's `date` field (when the money was spent), not by the operation
  timestamp and never by processing time. A correction made in March to a
  January expense still lands in January.
- **lod (level of detail)**: truncates dimension paths to N segments at
  query time: `lod: { category: 4 }` collapses
  `ph/expenses/category/headcount/salaries` into
  `ph/expenses/category/headcount`. Every key in `select` needs a `lod`
  entry.
- **Explicit query windows**: the engine can derive a missing start/end
  from the data, but that breaks down on degenerate inputs such as every
  value landing on a single date. Every query in `src/query.ts` passes an
  explicit window.

## Running the demo

After `pnpm install` and `pnpm build` at the repo root:

```sh
pnpm start
```

`src/demo.ts` boots a reactor, creates three expense reports, dispatches nine
adds, one amount correction, and one delete, waits for the processor via the
processor-manager consistency tracker (no sleeps), then prints three
aggregation tables.

## Tests

```sh
pnpm test
```

`src/processor.test.ts` runs the processor against a real PGlite-backed
store. It covers the delta arithmetic (add/update/delete, date-moving
updates), idempotent replay (same operations delivered twice → same totals),
source clearing isolation between documents, slug escaping of hostile
category names, currency separation, and skipping of failed operations.

## Regenerating the document model

```sh
pnpm generate document-model --document document-models/expense-report/expense-report.json
```

Requires the Powerhouse monorepo checked out next to this repo (the script
calls `../../powerhouse/clis/ph-cli/dist/cli.mjs`). The generated output
targets a newer `document-model` than the version pinned in the workspace
pnpm catalog (`pnpm-workspace.yaml`). A few imports are adjusted to the
`document-model/core` subpath (marked with comments), and `v1/hooks.ts`
(which requires `@powerhousedao/reactor-browser`) is removed.

## License

AGPL-3.0-only
