# Subscription CLI

A standalone CLI for monitoring Powerhouse Reactor GraphQL subscriptions over WebSocket in real time.

Subscribes to `documentChanges` and optionally `jobChanges`, printing timestamped events to stdout. Useful for debugging, integration testing, and observing Reactor activity.

## Usage

```sh
pnpm start
```

With options:

```sh
pnpm start -- --url ws://localhost:4001/graphql/subscriptions \
  --type "powerhouse/billing-statement" \
  --parent-id "drive-abc-123" \
  --auth "eyJhbG..."
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--url <url>` | WebSocket endpoint | `ws://localhost:4001/graphql/subscriptions` |
| `--type <type>` | Filter `documentChanges` by document type | _(none)_ |
| `--parent-id <id>` | Filter `documentChanges` by parent document (drive) ID | _(none)_ |
| `--job-id <id>` | Also subscribe to `jobChanges` for a specific job | _(none)_ |
| `--auth <token>` | Bearer token for authentication | _(none)_ |
| `--help` | Show help message | |

## Example output

```
[12:34:56.789] Connecting to ws://localhost:4001/graphql/subscriptions...
[12:34:56.801] Connected
[12:34:56.802] Subscribing to documentChanges (type: powerhouse/billing-statement)...
[12:34:56.803] Listening for events. Press Ctrl+C to stop.
[12:34:58.100] documentChanges [UPDATE] Invoice Q1 (powerhouse/billing-statement)
```

Press `Ctrl+C` for clean shutdown.
