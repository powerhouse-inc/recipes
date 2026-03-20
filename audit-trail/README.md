# Audit Trail

A Reactor processor that inspects `ActionSigner` context on every operation to build an immutable audit log in PostgreSQL. Exposes a GraphQL subgraph for querying entries by user, document, or time range.

## What it demonstrates

- **Signature/signer inspection** — extracting `user.address`, `networkId`, `chainId`, and app credentials from `operation.action.context.signer`
- **Relational DB processor** — batch-inserting structured rows via Kysely
- **Subgraph resolvers** — GraphQL API over the audit log using graphql-yoga
- **Operation context fields** — using `documentId`, `documentType`, `action.type`, and `timestampUtcMs`

## Setup

```sh
pnpm install
pnpm build
```

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

## Tests

```sh
pnpm test
```

Tests use [PGlite](https://github.com/electric-sql/pglite) for an in-memory PostgreSQL instance.
