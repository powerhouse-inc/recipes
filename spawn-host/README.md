# Spawn Host

Launching `ph run <host>` from code, for a test harness, a supervisor or a script that needs a real host and nothing else from the project. `spawnHost` in `@powerhousedao/host-core` runs the project's own ph-cli as a child and returns once the child's run record appears (powerhouse PR #3286, behind `FEATURE_UNIFORM_RUNNERS_ENABLED`).

## What `spawnHost` guarantees

| Concern | Behaviour |
|---------|-----------|
| Environment | The child gets `PATH`, `HOME`, `TMPDIR` and the keys in `env`, never the rest of `process.env` |
| `.env` files | `PH_NO_DOTENV=1` is set, so the project's `.env` and `.env.local` are not read |
| State | `dataDir` becomes the child's `PH_USER_DATA_DIR`; run record, reactor storage and renown files go there, not into the project's `.ph` |
| Readiness | Resolves with the run record and its `outputs`; rejects with the output tail if the child exits first or `readyTimeoutMs` passes |
| Shutdown | `stop()` sends SIGTERM, then SIGKILL after `stopTimeoutMs`, and clears a leftover record |

`env` may not set `PH_USER_DATA_DIR`; use `dataDir`. One-shot verbs such as `build` and runners without an `outputsSchema` are refused, because they write no run record to wait for.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/launch.ts` | `withHost`: spawn into a temp data dir, run a callback, always stop and delete |
| `src/demo.ts` | Starts a host from a project and prints its outputs |
| `src/launch.test.ts` | `withHost` cleanup on success and on a throwing callback, with a fake `spawnHost` |

## Running

```bash
pnpm test
pnpm start /path/to/project my-host
```

## Requirements

`spawnHost` is not in `@powerhousedao/host-core` 6.2.3-dev.73 or earlier. Until the workspace catalog pins a release that exports it, `loadSpawnHost()` returns `undefined` and the demo exits with a message. Once it does, the local types in `src/launch.ts` can be replaced by the package's own.
