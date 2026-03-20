# Powerhouse Recipes

Example integrations and utilities for [Powerhouse Reactor](https://github.com/powerhouse-inc).

## Projects

| Project | Description |
|---------|-------------|
| [audit-trail](./audit-trail) | Reactor processor that builds an immutable audit log from ActionSigner context with a GraphQL subgraph |
| [batch-progress](./batch-progress) | Batch document creation with real-time progress tracking via Reactor EventBus |
| [cross-document-reactor](./cross-document-reactor) | Event-driven cross-document automation using ReactorClient subscriptions to dispatch actions across related documents |
| [custom-read-model](./custom-read-model) | Custom IReadModel with ReactorBuilder for a document-count-per-type materialized view |
| [discord-webhook-processor](./discord-webhook-processor) | Reactor processor that forwards document operations to a Discord webhook as rich embeds |
| [document-snapshot-exporter](./document-snapshot-exporter) | CLI tool for reliable read-after-write export of document state to JSON using IReactor consistency tokens |
| [full-text-search](./full-text-search) | Reactor processor that maintains a PostgreSQL full-text search index over document state |
| [rate-limiter](./rate-limiter) | Reactor processor and auth gate that throttles users by signer address using a sliding window |
| [relational-db-subgraph](./relational-db-subgraph) | RelationalDbProcessor recipe with Kysely migrations, typed schema, and a GraphQL subgraph for document catalog |
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
