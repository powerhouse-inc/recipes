# Full-Text Search Processor

A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance. A Reactor (`@powerhousedao/reactor`) stores documents and their operation history and routes each batch of operations to the processors registered with it.

## How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded).
2. Flattens the resulting document state into a single searchable string via `flattenToSearchableText`.
3. Upserts a row in `search_index` with the content and a PostgreSQL `tsvector`.
4. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

## Architecture

| Module | Purpose |
|--------|---------|
| `processor.ts` | `SearchProcessor`: the `IProcessor` implementation |
| `schema.ts` | Kysely type definitions for the `search_index` table |
| `migrations.ts` | `up` / `down` functions to create/drop the table and `idx_search_tsv`, a GIN (inverted) index on `tsv` |
| `query.ts` | `createSearchQuery`: returns a `search(term, limit?)` helper using `ts_rank` |
| `utils.ts` | `flattenToSearchableText`: recursively extracts all string values from a JSON state |

## Prerequisites

- PostgreSQL with full-text search support (`tsvector`, `plainto_tsquery`, `ts_rank`)
- [Kysely](https://kysely.dev/) database instance

## Run it

```sh
pnpm start   # demo.ts: builds a reactor, indexes three documents, runs searches
pnpm test    # vitest against in-process PGlite
```

## Usage

### Run migrations

```ts
import { up } from "@powerhousedao/example-full-text-search";

await up(db);
```

### Register the processor

```ts
import { SearchProcessor } from "@powerhousedao/example-full-text-search";

const processor = new SearchProcessor(db);
```

Hand the processor to the Reactor's `ProcessorManager`: `registerFactory("full-text-search", () => [{ processor, filter: { branch: ["main"] }, startFrom: "beginning" }])`. `demo.ts` makes the same call against a module built by `ReactorBuilder`.

### Query the index

```ts
import { createSearchQuery } from "@powerhousedao/example-full-text-search";

const search = createSearchQuery(db);
const results = await search.search("budget allocation", 10);
// returns: [{ document_id, document_type, title, rank }]
```

## Exports

Beyond `up`, `SearchProcessor`, and `createSearchQuery`, `index.ts` exports `down` (drops the index, then the table), `flattenToSearchableText`, and the types `SearchResult`, `SearchDB`, and `SearchIndex`.
