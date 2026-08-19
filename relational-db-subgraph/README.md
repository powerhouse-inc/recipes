# Relational DB Subgraph

A relational DB processor that catalogs every document it sees, with Kysely migrations, a typed query layer, and a GraphQL subgraph over the result. This is the pattern `ph generate --processor` and `ph generate --subgraph` produce.

## What it does

A Reactor (`@powerhousedao/reactor`) stores documents and their operation history and hands each batch of operations to the processors registered with it. The `CatalogProcessor` watches all documents flowing through the Reactor (document-type-agnostic) and maintains a denormalized relational view:

- `documents` stores document metadata: ID, type, name, content summary, revision, and `updated_at`.
- `document_tags` stores tags extracted from document state by `extractTags`, which reads the `tags` or `labels` array.

The GraphQL subgraph exposes this data via queries like `documents`, `document(id)`, `documentsByType`, and `documentsByTag`.

## Mapping to `ph generate`

| Generated artifact | File in this recipe |
|---|---|
| `ph generate --processor` | `src/processor.ts`: `CatalogProcessor extends RelationalDbProcessor<CatalogDB>`, which gives it namespaced DB access, `initAndUpgrade()` to apply migrations, and a type-safe `query` builder |
| `ph generate --subgraph` | `src/subgraph.ts`: `createCatalogSchema` builds the GraphQL SDL and resolvers over the query layer, `startCatalogServer` serves them with graphql-yoga |
| Schema types | `src/schema.ts`: the Kysely DB interface `CatalogDB`, with the `DocumentRow` and `DocumentTagRow` row types |
| Migrations | `src/migrations.ts`: `up()` creates both tables and their indexes, `down()` drops them |
| Query layer | `src/query.ts`: `createCatalogQuery` returns typed reads with a join onto `document_tags`, filtering by type or tag, and `limit`/`offset` pagination |

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

`createCatalogSchema` in `src/subgraph.ts` returns a standalone schema, so a gateway like Apollo Router or GraphQL Mesh can compose it alongside other subgraphs, such as the Reactor's built-in GraphQL endpoint. One request then spans the catalog and the other sources. Nothing in this recipe runs a gateway, so the composition itself is untested here.

## Running tests

```sh
pnpm test
```

Tests use PGlite (embedded PostgreSQL), so no external database is required. `pnpm start` runs `src/demo.ts`, which builds a Reactor, creates three documents, and prints the catalog rows.

## License

AGPL-3.0-only
