# Audit Trail

A [Powerhouse Reactor](https://github.com/powerhouse-inc) processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL. Exposes a GraphQL subgraph for querying entries by user, document, or time range.

## What it demonstrates

- `getSignerContext` reads `user.address`, `user.networkId`, `user.chainId`, and the app's `name` and `key` out of `operation.action.context.signer`. Operations that arrive without a signer are skipped.
- `AuditTrailProcessor.onOperations` turns a batch of operations into rows and writes them to `audit_log` with a single Kysely insert.
- Resolvers built by `createAuditSchema` serve the audit log over graphql-yoga.
- A row carries `documentId` and `documentType` from the operation context, with `action.type` and `timestampUtcMs` from the action itself.

## Usage

### Processor

```ts
import { Kysely, PostgresDialect } from "kysely";
import { up, AuditTrailProcessor, createAuditTrailFactory } from "@powerhousedao/example-audit-trail";

const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
await up(db);

await processorManager.registerFactory(
  "audit-trail",
  createAuditTrailFactory({
    db,
    filter: { branch: ["main"] },
  }),
);
```

### GraphQL subgraph

```ts
import { startAuditServer } from "@powerhousedao/example-audit-trail";

const server = startAuditServer(db, 4002);
```

Query examples:

```graphql
# By user
{ auditByUser(address: "0xabc", limit: 10) { actionType documentId timestamp } }

# By document
{ auditByDocument(documentId: "doc-1", limit: 10) { signerAddress actionType timestamp } }

# By time range
{ auditByTimeRange(from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z") { signerAddress actionType documentId } }
```

## Running it

```sh
pnpm install
pnpm build
pnpm test
pnpm start
```

`pnpm start` runs `src/demo.ts`, which signs its operations with a Renown key, creates a drive and three documents, then prints the audit rows for that signer.

Tests and the demo use [PGlite](https://github.com/electric-sql/pglite) for an in-memory PostgreSQL instance.
