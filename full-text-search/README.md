# Full-Text Search Processor

A Reactor `IProcessor` that indexes document state into a PostgreSQL full-text search table, enabling ranked keyword search across all documents managed by a Reactor instance.

## How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded).
2. Flattens the resulting document state into a single searchable string via `flattenToSearchableText`.
3. Upserts a row in `search_index` with the content and a PostgreSQL `tsvector`.
4. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

## Architecture

| Module | Purpose |
|--------|---------|
| `processor.ts` | `SearchProcessor` — the `IProcessor` implementation |
| `schema.ts` | Kysely type definitions for the `search_index` table |
| `migrations.ts` | `up` / `down` functions to create/drop the table and GIN index |
| `query.ts` | `createSearchQuery` — returns a `search(term, limit?)` helper using `ts_rank` |
| `utils.ts` | `flattenToSearchableText` — recursively extracts all string values from a JSON state |

## Prerequisites

- PostgreSQL with full-text search support (`tsvector`, `plainto_tsquery`, `ts_rank`)
- [Kysely](https://kysely.dev/) database instance

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

### Query the index

```ts
import { createSearchQuery } from "@powerhousedao/example-full-text-search";

const search = createSearchQuery(db);
const results = await search.search("budget allocation", 10);
// returns: [{ document_id, document_type, title, rank }]
```

## Exports

```ts
export { SearchProcessor } from "./processor.js";
export { createSearchQuery } from "./query.js";
export type { SearchResult } from "./query.js";
export type { SearchDB, SearchIndex } from "./schema.js";
export { flattenToSearchableText } from "./utils.js";
export { up, down } from "./migrations.js";
```
