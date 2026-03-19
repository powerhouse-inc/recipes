# Powerhouse Recipes

Example integrations and utilities for [Powerhouse Reactor](https://github.com/powerhouse-inc).

## Projects

| Project | Description |
|---------|-------------|
| [batch-progress](./batch-progress) | Batch document creation with real-time progress tracking via Reactor EventBus |
| [discord-webhook-processor](./discord-webhook-processor) | Reactor processor that forwards document operations to a Discord webhook as rich embeds |
| [full-text-search](./full-text-search) | Reactor processor that maintains a PostgreSQL full-text search index over document state |
| [rate-limiter](./rate-limiter) | Reactor processor and auth gate that throttles users by signer address using a sliding window |
| [subscription-cli](./subscription-cli) | CLI tool for monitoring Reactor GraphQL subscriptions in real time |

## Getting Started

Prerequisites: Node.js and [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm build
```

## License

AGPL-3.0-only
