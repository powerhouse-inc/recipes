# Analytics Processor

A [Reactor](https://github.com/powerhouse-inc) processor that projects
expense-report line items into the Powerhouse analytics engine (a dimensional
time-series store) and a query layer that reads aggregations back out.
Everything runs in-process (the store is backed by PGlite, an embedded
PostgreSQL), so the demo needs no external services.

## What it demonstrates

- Implementing `IProcessor` (from `@powerhousedao/reactor`) as
  `ExpenseAnalyticsProcessor` in `src/processor.ts`, whose constructor
  receives an `IAnalyticsStore`, registered through a `ProcessorFactory` with
  a document-type filter.
- Mapping `ADD_LINE_ITEM` / `UPDATE_LINE_ITEM` / `DELETE_LINE_ITEM` operations
  into append-only series values: updates and deletes write **compensating
  entries** (−old, +new) instead of mutating history.
- Querying with `AnalyticsQueryEngine` (`src/query.ts`): totals per
  category, monthly aggregation, and a category × currency breakdown.

## When to use the analytics engine vs a SQL read model

|  | analytics-processor (this recipe) | custom-read-model | relational-db-subgraph |
|---|---|---|---|
| Storage model | Dimensional time-series | In-memory map | Relational rows (Kysely schema) |
| Query style | Time-bucketed aggregates over dimensions | Direct lookup | Arbitrary SQL: joins, filters, ordering |
| Best for | "Total per category per month in USD" | Simple derived counts | Searchable catalogs, tag filters |

Use the analytics engine when queries are shaped like *aggregate metric X,
grouped by dimension Y, over period Z, rolled up to depth N*.

## The series model

- **Source**: an `AnalyticsPath` identifying who owns a set of series, one per
  document (`ph/expenses/<documentId>`). A processor with
  `startFrom: "beginning"` can be re-delivered the whole history, so a second
  index-0 operation means replay: `clearSeriesBySource(source, true)` wipes
  that document's series, and the rebuild reaches the same totals.
- **Dimensions**: named `AnalyticsPath`s attached to every value (`category`,
  `currency`). `categoryPathFor` slugifies user data: `Headcount/Salaries`
  becomes `ph/expenses/category/headcount/salaries`.
- **Metric + unit**: the metric is a plain string (`"Expenses"`) and the unit
  carries the currency code. One series per currency, so the engine never sums
  across units.
- **Business time vs event time**: values are dated by the line item's
  `date` field, not the operation timestamp or processing time. A March
  correction to a January expense still lands in January.

## Querying

Queries `select` on dimension path prefixes and group by paths truncated at
query time by `lod` (level of detail): `lod: { category: 4 }` collapses
`ph/expenses/category/headcount/salaries` into
`ph/expenses/category/headcount`, and every key in `select` needs a `lod`
entry. Every query in `src/query.ts` also passes an explicit window. The
engine can derive a missing start/end from the data, but that breaks down
when every value lands on a single date.

## Running the demo

After `pnpm install` and `pnpm build` at the repo root:

```sh
pnpm start
```

`src/demo.ts` boots a reactor, creates three expense reports, dispatches nine
adds, one amount correction, and one delete, waits on
`reactorModule.processorManagerConsistencyTracker.waitFor` (no sleeps), then
prints three aggregation tables.

## Tests

```sh
pnpm test
```

`src/processor.test.ts` runs the processor against a real PGlite-backed
store.
