# Sync Health Monitor

Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard. Exposes metrics via a GraphQL subgraph.

## What it shows

The recipe reaches into the built `ReactorModule` for two handles: `eventBus`, which the health monitor subscribes to, and `syncModule`, which registers the remote on each side. The demo then drives the pair through failure and recovery, so all five sync event types fire at least once.

## How it works

1. Builds reactor A and reactor B, each on in-memory PGlite, an in-process Postgres, no external DB.
2. Wires them together with a shared `IChannelFactory` that creates `InternalChannel` pairs, handing operations from one reactor's outbox straight into the other's inbox with no network in between.
3. Attaches a `SyncHealthMonitor` to reactor A's `EventBus`, subscribing to all five sync event types (`SYNC_PENDING`, `SYNC_SUCCEEDED`, `SYNC_FAILED`, `DEAD_LETTER_ADDED`, `CONNECTION_STATE_CHANGED`). The monitor keeps counters, connection states, and the last 50 errors.
4. Serves those metrics through a `syncHealth` GraphQL query on `http://localhost:4001/graphql`.
5. Redraws a terminal dashboard every two seconds with health status, sync counters, connection states, and the five most recent errors.
6. Runs the demo scenario through the four phases below.

### Demo phases

| Phase | What happens | Events fired |
|-------|-------------|-------------|
| Normal sync | Create a document on A, syncs to B | `SYNC_PENDING`, `SYNC_SUCCEEDED` |
| Connection issue | Simulate disconnect → reconnect on the channel | `CONNECTION_STATE_CHANGED` (x3) |
| Failure | Make the channel throw, then create a document | `SYNC_PENDING`, `SYNC_FAILED`, `DEAD_LETTER_ADDED` |
| Recovery | Restore the channel, create another document | `SYNC_PENDING`, `SYNC_SUCCEEDED` |

### Health status logic

| Status | Condition |
|--------|-----------|
| `healthy` | All connections up, low failure ratio, no dead letters |
| `degraded` | A connection is disconnected/reconnecting, failure ratio >10%, or dead letters exist |
| `unhealthy` | Any connection is in `error` state |

## Usage

```sh
pnpm install
pnpm start
```

### JSON mode

```sh
pnpm start -- --json
```

Emits one JSON line per refresh interval instead of the visual dashboard.

### GraphQL query

While the dashboard is running, query the subgraph:

```sh
curl -s http://localhost:4001/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ syncHealth { healthStatus pendingCount successCount failureCount deadLetterCount connectionStates { remoteName state } recentErrors { timestamp remoteName error } } }"}' \
  | jq .
```

### Example output

```
Sync Health Monitor                            uptime 0h 0m 12s
============================================================
  Status:  HEALTHY

  Sync Operations
    pending: 0   succeeded: 2   failed: 0
    dead letters: 0

  Connections
    remoteB              connected

------------------------------------------------------------
  GraphQL: http://localhost:4001/graphql   Ctrl+C to quit
```

## Tests

```sh
pnpm test
```

Unit tests verify the `SyncHealthMonitor` class in isolation using a standalone `EventBus` with synthetic events.

## License

AGPL-3.0-only
