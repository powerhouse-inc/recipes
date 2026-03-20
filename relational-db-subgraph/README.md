# Relational DB Subgraph

A complete relational DB processor recipe demonstrating the academy flagship tutorial pattern:

- **RelationalDbProcessor** — extends the base class with `initAndUpgrade()`, namespaced DB, and type-safe `query` builder
- **Kysely migrations** — up/down migrations creating `documents` and `document_tags` tables
- **Typed schema** — full Kysely DB interface with `CatalogDB`, `DocumentRow`, and `DocumentTagRow`
- **Type-safe queries** — Kysely query layer with joins, filtering by type/tag, and pagination
- **GraphQL subgraph** — graphql-yoga server exposing the catalog data, ready for supergraph composition

## What it does

The `CatalogProcessor` watches all documents flowing through the Reactor (document-type-agnostic) and maintains a denormalized relational view:

- **`documents`** table — stores document metadata (ID, type, name, content summary, revision)
- **`document_tags`** table — stores tags extracted from document state

The GraphQL subgraph exposes this data via queries like `documents`, `document(id)`, `documentsByType`, and `documentsByTag`.

## Mapping to `ph generate`

| Generated artifact | File in this recipe |
|---|---|
| `ph generate --processor` | `src/processor.ts` — `CatalogProcessor extends RelationalDbProcessor<CatalogDB>` |
| `ph generate --subgraph` | `src/subgraph.ts` — GraphQL SDL + resolvers backed by the query layer |
| Schema types | `src/schema.ts` — Kysely DB interface |
| Migrations | `src/migrations.ts` — `up()`/`down()` functions |
| Query layer | `src/query.ts` — type-safe Kysely queries with joins |

## Usage

```ts
import { Kysely } from "kysely";
import { createRelationalDb } from "@powerhousedao/reactor";
import { CatalogProcessor, startCatalogServer } from "@powerhousedao/example-relational-db-subgraph";

// 1. Create a Kysely instance (PGlite, PostgreSQL, etc.)
const db = new Kysely<CatalogDB>({ dialect });
const relationalDb = createRelationalDb(db);

// 2. Create and initialize the processor
const processor = new CatalogProcessor("catalog", { branch: ["main"] }, relationalDb);
await processor.initAndUpgrade();

// 3. Register with the Reactor processor manager
await processorManager.registerFactory("catalog", () => [
  {
    processor,
    filter: { branch: ["main"] },
    startFrom: "beginning",
  },
]);

// 4. Start the GraphQL subgraph server
startCatalogServer(db, 4002);
// → Catalog subgraph ready at http://localhost:4002/graphql
```

## Supergraph composition

This subgraph can be composed into a supergraph alongside other subgraphs (e.g., the Reactor's built-in GraphQL endpoint). With a gateway like Apollo Router or GraphQL Mesh, you can query documents from the catalog and other sources in a single request.

## Running tests

```sh
pnpm test
```

Tests use PGlite (embedded PostgreSQL) — no external database required.

## License

AGPL-3.0-only
