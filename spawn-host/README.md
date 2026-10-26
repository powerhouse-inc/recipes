# Spawn Host

Launching `ph run <host>` from code, for a test harness, a supervisor or a script that needs a real host and nothing else from the project. `spawnHost` in `@powerhousedao/host-core` runs the project's own ph-cli as a child and returns once the child's run record appears (powerhouse PR #3286). The recipe is its own project: it ships `hosts/switchboard/host.js` and starts it.

## What `spawnHost` guarantees

| Concern | Behaviour |
|---------|-----------|
| Environment | The child gets `PATH`, `HOME` and `TMPDIR` (plus the Windows profile keys on win32), never the rest of `process.env`. spawnHost adds `FEATURE_UNIFORM_RUNNERS_ENABLED=1`, `PH_NO_TELEMETRY=1`, `PH_NO_DOTENV=1` and `PH_USER_DATA_DIR`, then `env` on top |
| `.env` files | `PH_NO_DOTENV=1` keeps the project's `.env` and `.env.local` unread, unless `env` overrides it or the project's ph-cli predates the flag |
| State | `dataDir` becomes the child's `PH_USER_DATA_DIR` and is created if missing. The run record, reactor and read-model storage, keypair and renown files go under `<dataDir>/.ph`, not the project's `.ph` |
| ph-cli | `cli`, or by default the `@powerhousedao/ph-cli` that `projectRoot/package.json` resolves |
| Readiness | Polls for a run record with the child's pid. Resolves with `record`, `outputs` and `members`; `members` is `undefined` for a single host |
| Failure | Rejects with a `SpawnHostError` whose `phase` is `exited`, `timeout` (`readyTimeoutMs`, default 120 s, stops the child first) or `aborted` (`signal`), with `outputTail` and `exit` |
| Shutdown | `stop()` sends SIGTERM, SIGKILL after `stopTimeoutMs` (default 30 s), then clears the child's own run record. It resolves with `HostExit` (`code`, `signal`, `forced`) and is safe to call twice. `exited` resolves with the same value whenever the child exits |
| Parent exit | Children still running get SIGTERM when the parent process exits |

`env` may not set `PH_USER_DATA_DIR`; use `dataDir`. `spawnHost` refuses one-shot verbs such as `build`, runners without an `outputsSchema`, and compound hosts with `config.runtimeRecord: false`, because none of them write a run record to wait for. `onOutput` and `logFile` receive the child's stdout and stderr.

## Architecture

| File | Purpose |
|------|---------|
| `hosts/switchboard/host.js` | A switchboard on port 0 (the OS picks one) with its storage under `${userData}` and one drive, `recipes` |
| `src/launch.ts` | `withHost`: spawn into a temp data dir, run a callback, always stop and delete |
| `src/demo.ts` | Starts the fixture, prints its outputs, calls its GraphQL endpoint and drive URL, stops it |
| `src/launch.test.ts` | `withHost` cleanup on success, a throwing callback, a rejecting `spawnHost` and a failing `stop`, with a fake `spawnHost` |
| `src/spawn.test.ts` | The fixture through the real `spawnHost`: outputs answer, then the child exits 0, its data dir is gone and the project has no `.ph`; two hosts at once get distinct ports |

## Running

```bash
pnpm test    # includes a real spawn, about 10 s
pnpm start
```

## Port 0

The fixture sets `runner.port: 0`. The switchboard reports the port the OS bound, so `outputs.origin`, the endpoints, the drive URLs and the run record carry it instead of `:0`. Read the port from the outputs; no probe-then-bind race, so concurrent hosts are safe (powerhouse PR #3285).

## Requirements

`@powerhousedao/host-core` 6.2.3-dev.74 or later, the first release that exports `spawnHost`. The recipe takes host-core and `@powerhousedao/ph-cli` from the workspace catalog; that ph-cli is the one `spawnHost` runs, and it needs the uniform runners (`@powerhousedao/ph-cli/runners/switchboard`).
