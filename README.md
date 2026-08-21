# Powerhouse Recipes

Example integrations and utilities for [Powerhouse Reactor](https://github.com/powerhouse-inc).
Run `pnpm install` and `pnpm build` at the repo root before running any recipe.

## Document models

| Project | Description |
|---------|-------------|
| [document-versioning](./document-versioning) | Document model schema migration from v1 to v2 with an `UpgradeManifest` and a pure `upgradeReducer` |
| [drive-override](./drive-override) | Custom container document that tracks children via the reactor's ADD_RELATIONSHIP action instead of document-drive's ADD_FILE |
| [positional-delete](./positional-delete) | Deletion as a position in the merged operation order. Pre-delete operations survive sync |

## Authorization

| Project | Description |
|---------|-------------|
| [auth-preflight](./auth-preflight) | Asking the reactor what it would decide before submitting. One `evaluateActions` call answers a batch of candidate operations |
| [document-acl](./document-acl) | Platform-enforced document ACLs via the auth scope, with zero authorization code in reducers |
| [group-principals](./group-principals) | A `reactor-group` roster document decides who may approve via a `{ group }` grant |
| [rate-limiter](./rate-limiter) | Reactor processor and auth gate that throttles users by signer address using a sliding window |
| [revocation-race](./revocation-race) | Convergent authorization: a grant revocation races an approval across two reactors |
| [role-based-auth](./role-based-auth) | Custom document model with creator-as-admin RBAC enforced inside the reducer via `action.context.signer` |
| [scoped-reads](./scoped-reads) | The read path of the auth scope: one policy decides what every read returns, on the client rather than in the reactor |

## Processors and read models

| Project | Description |
|---------|-------------|
| [analytics-processor](./analytics-processor) | Maps expense-report operations into the analytics-engine time-series store |
| [audit-trail](./audit-trail) | Builds an immutable audit log from ActionSigner context |
| [custom-read-model](./custom-read-model) | Custom IReadModel with ReactorBuilder for a document-count-per-type materialized view |
| [full-text-search](./full-text-search) | Maintains a PostgreSQL full-text search index over document state |
| [relational-db-subgraph](./relational-db-subgraph) | RelationalDbProcessor recipe with Kysely migrations, typed schema, and a GraphQL subgraph for document catalog |
| [saga](./saga) | Saga pattern via Reactor processor: operations on one document trigger operations on others |
| [semantic-search](./semantic-search) | Embeds document state in-process (Transformers.js) into PGlite + pgvector and answers cosine-similarity queries |

## External systems

| Project | Description |
|---------|-------------|
| [discord-webhook-processor](./discord-webhook-processor) | Reactor processor that forwards document operations to a Discord webhook as rich embeds |
| [external-feed-ingest](./external-feed-ingest) | Polling worker that ingests an external feed into a ledger document idempotently |
| [inbound-webhook-bridge](./inbound-webhook-bridge) | Standalone endpoint that verifies signed external webhooks against the raw bytes and dispatches them as payment-document actions |

## Events and subscriptions

| Project | Description |
|---------|-------------|
| [batch-progress](./batch-progress) | Batch document creation with per-job progress tracked through Reactor EventBus job events |
| [cross-document-reactor](./cross-document-reactor) | Event-driven cross-document automation using ReactorClient subscriptions to dispatch actions across related documents |
| [sync-health-monitor](./sync-health-monitor) | Sync health dashboard via EventBus subscriptions with GraphQL subgraph |

## Command-line tools

| Project | Description |
|---------|-------------|
| [db-migrate](./db-migrate) | PostgreSQL database export, import, and migration scripts using Docker (no local pg tools required) |
| [document-snapshot-exporter](./document-snapshot-exporter) | Read-after-write export of document state to JSON using IReactor consistency tokens |
| [signed-operations-verifier](./signed-operations-verifier) | Standalone script that signs a document operation history with `RenownCryptoSigner`, then verifies every signature |
| [subscription-cli](./subscription-cli) | Monitors Reactor GraphQL subscriptions in real time |
