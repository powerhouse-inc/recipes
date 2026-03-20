# Sync Health Monitor

Subscribes to `SyncEventTypes` on the Reactor EventBus and maintains a live health dashboard. Exposes metrics via a GraphQL subgraph.

## What it shows

- **EventBus subscriptions** — listens to all five sync event types (`SYNC_PENDING`, `SYNC_SUCCEEDED`, `SYNC_FAILED`, `DEAD_LETTER_ADDED`, `CONNECTION_STATE_CHANGED`)
- **ReactorModule internals** — accesses `eventBus` and `syncModule` from the built `ReactorModule`
- **Two-reactor sync** — wires two embedded reactors via a custom `InternalChannel` (no network, direct in-process delivery)
- **GraphQL subgraph** — serves a `syncHealth` query with counters, connection states, and recent errors
- **Live dashboard** — refreshing terminal display with health status, sync counters, and connection states

## How it works

1. **Two embedded reactors** — builds reactor A and reactor B, each with in-memory PGlite
2. **Internal channels** — a shared `IChannelFactory` creates `InternalChannel` pairs that deliver operations directly between reactors
3. **Health monitor** — subscribes to reactor A's `EventBus` for all `SyncEventTypes`, maintains counters and connection state
4. **GraphQL server** — serves the health metrics via a `syncHealth` query on `http://localhost:4001/graphql`
5. **Demo scenario** — runs through four phases: normal sync, connection state changes, simulated failure, and recovery

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
