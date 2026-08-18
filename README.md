# Powerhouse Recipes

Example integrations and utilities for [Powerhouse Reactor](https://github.com/powerhouse-inc).

## Projects

| Project | Description |
|---------|-------------|
| [analytics-processor](./analytics-processor) | Reactor processor that maps expense-report operations into the analytics-engine time-series store, with aggregation queries by category, month, and currency |
| [audit-trail](./audit-trail) | Reactor processor that builds an immutable audit log from ActionSigner context with a GraphQL subgraph |
| [auth-preflight](./auth-preflight) | Asking the reactor what it would decide before submitting — one preflight answers a batch of candidate operations, the verdict matches what the submit does, and a policy landing in between makes it a prediction rather than a promise |
| [batch-progress](./batch-progress) | Batch document creation with real-time progress tracking via Reactor EventBus |
| [cross-document-reactor](./cross-document-reactor) | Event-driven cross-document automation using ReactorClient subscriptions to dispatch actions across related documents |
| [custom-read-model](./custom-read-model) | Custom IReadModel with ReactorBuilder for a document-count-per-type materialized view |
| [db-migrate](./db-migrate) | PostgreSQL database export, import, and migration scripts using Docker (no local pg tools required) |
| [discord-webhook-processor](./discord-webhook-processor) | Reactor processor that forwards document operations to a Discord webhook as rich embeds |
| [document-acl](./document-acl) | Platform-enforced document ACLs via the auth scope and the `documentDecisions`/`authEnforcement` feature flags — grant stacks, last-applicable-grant-wins, zero authorization code in reducers |
| [document-snapshot-exporter](./document-snapshot-exporter) | CLI tool for reliable read-after-write export of document state to JSON using IReactor consistency tokens |
| [document-versioning](./document-versioning) | Document model schema migration from v1 to v2 with an `UpgradeManifest` and a pure `upgradeReducer` that keeps old operation logs replayable |
| [drive-override](./drive-override) | Custom container document that tracks children via the reactor's ADD_RELATIONSHIP action instead of document-drive's ADD_FILE, keeping container state O(1) |
| [external-feed-ingest](./external-feed-ingest) | Polling worker that ingests an external feed into a ledger document idempotently — dedup set and high-watermark seeded from document state, corrections modeled as explicit supersede operations |
| [full-text-search](./full-text-search) | Reactor processor that maintains a PostgreSQL full-text search index over document state |
| [group-principals](./group-principals) | A `reactor-group` roster document decides who may approve via a `{ group }` grant — hiring and offboarding are single membership operations, membership is judged at each operation's position, and a replica without the roster fails closed until it syncs |
| [inbound-webhook-bridge](./inbound-webhook-bridge) | Standalone endpoint that verifies signed external webhooks against the raw bytes and dispatches them as payment-document actions, with replay-window and event-id dedup |
| [positional-delete](./positional-delete) | Deletion as a position in the merged operation order — pre-delete operations survive sync, post-delete operations are stored denied, and both reactors converge without coordination |
| [rate-limiter](./rate-limiter) | Reactor processor and auth gate that throttles users by signer address using a sliding window |
| [relational-db-subgraph](./relational-db-subgraph) | RelationalDbProcessor recipe with Kysely migrations, typed schema, and a GraphQL subgraph for document catalog |
| [revocation-race](./revocation-race) | Convergent authorization: a grant revocation races an approval across two reactors, and both independently reach the same per-position verdict — no origin verdict shipped or trusted |
| [role-based-auth](./role-based-auth) | Custom document model with creator-as-admin RBAC enforced inside the reducer via `action.context.signer` |
| [saga](./saga) | Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context |
| [scoped-reads](./scoped-reads) | The read path of the auth scope: one policy decides what every read returns, per scope and per identity, on the client rather than in the reactor |
| [semantic-search](./semantic-search) | Reactor processor that embeds document state in-process (Transformers.js) into PGlite + pgvector and answers cosine-similarity queries |
| [subscription-cli](./subscription-cli) | CLI tool for monitoring Reactor GraphQL subscriptions in real time |
| [sync-health-monitor](./sync-health-monitor) | Sync health dashboard via EventBus subscriptions with GraphQL subgraph |

## Getting Started

Prerequisites: Node.js and [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm build
```

## License

AGPL-3.0-only
