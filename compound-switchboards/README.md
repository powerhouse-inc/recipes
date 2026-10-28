# Compound Switchboards

Two switchboards in one `ph run` process, each configured on its own. Since powerhouse PR #3314 the switchboard runner writes no environment variables: a member's config is its `reactor` block plus its `config.switchboard`, with the operator's env over both. Two members of one compound can therefore differ in storage, protocol, auth and inspection. The recipe is its own project: `hosts/stack` is a compound of `hosts/sb-a` and `hosts/sb-b`, started with `spawnHost` and, for what only the process itself can see, with `runCompound`.

## What a member's config guarantees

| Concern | Behaviour |
|---------|-----------|
| Layers | The reactor block, then `config.switchboard`, then the operator's env. A later layer wins key by key |
| Operator env | Under `spawnHost` it is the `env` option: `spawnHost` sets `PH_NO_DOTENV=1`, so no `.env` is read. Under a shell `ph run`, shell values win over the project `.env`, and a `.env` value for a variable the reactor block sets is dropped |
| Reactor store | From the member's `storage`. Only `PH_REACTOR_DATABASE_URL` set by the shell or `spawnHost`'s `env` overrides it; the same name in `.env`, or `PH_SWITCHBOARD_DATABASE_URL`, does not |
| Read model | From the member's `readModel.url`. No env variable overrides it. A member without `readModel.url` takes `DATABASE_URL` from the env |
| Protocol | From the member's `reactor.protocol`. An env variable that matches it, or that names a key the block leaves unset, is accepted. One that contradicts it fails the start, naming the variable and the member's host file |
| `config.switchboard` keys | Strict. Unknown or misspelled keys are rejected. Keys the reactor block or the runner owns are not accepted (list below), and a key the reactor block also sets fails validation |
| `userDataDir` | `PH_USER_DATA_DIR` is the last layer. `spawnHost` always sets it to `dataDir`, so every member gets that dir whatever `config.switchboard.storage.userDataDir` says |
| `process.env` | The runner writes nothing to it. Both members read the env from the runner context |
| Outputs | The run record has no outputs of its own; `spawnHost` returns `outputs: undefined` and one entry per child in `members`, each with that switchboard's `origin`, `endpoints` and `drives` |
| Shutdown | `stop()` resolves with exit code 143: the compound's SIGTERM handler shuts both members down and exits with 128 + 15. A single switchboard host exits 0 |

The keys `config.switchboard` does not accept: `storage.reactor`, `storage.readModel`, `protocol` and `packages.dynamic` (set them in the reactor block), `server.port`, `server.dev`, `drive`, `remoteDrives` and `features.pluginHost` (the runner sets them from `runner.port`, the verb, `reactor.drives` and `runner.plugins`), and `logLevel` and `processorConfig` (process-wide, or not JSON). Of what the reactor block sets, only `features.workflows` (from `reactor.workflows`) is otherwise a `config.switchboard` key, so that is the overlap the conflict check catches.

## The members

| | `sb-a` | `sb-b` |
|---|---|---|
| Reactor store | `${userData}/.ph/sb-a/reactor` | `${userData}/.ph/sb-b/reactor` |
| Read model | `${userData}/.ph/sb-a/read-model` | `${userData}/.ph/sb-b/read-model` |
| `reactor.protocol` | `documentDecisions: true`, `createSignaturePolicy: "legacy"` | `documentDecisions: false`, `unsupportedStoredDocuments: "read-only"` |
| Drive | `alpha` | `beta` |
| `config.switchboard.auth` | `admins: ["0xa"]`, `wsRecheckMs: 1000` | `documentPermissions: { cacheTtlMs: 500 }` |
| `config.switchboard.inspection` | `enabled: false` | `enabled: true`, `callsPerMinute: 7` |
| `config.switchboard.identity` | default: `${userData}/.ph/.keypair.json` | `keypairPath: "${userData}/.ph/sb-b/.keypair.json"` |

Both set `runner.port: 0`, `reactor.workflows: false` and `config.switchboard.packages.disableLocal: true`. `${userData}` resolves to `PH_USER_DATA_DIR`, which `spawnHost` sets to its `dataDir`.

## Architecture

| File | Purpose |
|------|---------|
| `hosts/stack/host.js` | The compound: children `a` (`sb-a`) and `b` (`sb-b`), runner `@powerhousedao/host-core/runners/compound` |
| `hosts/sb-a/host.js`, `hosts/sb-b/host.js` | The members, runner `@powerhousedao/ph-cli/runners/switchboard`, configured as in the table above |
| `src/stack.ts` | `withStack`: spawn the stack into a temp data dir with an operator env, run a callback, always stop and delete. `membersOf`, `inspectionAnswers`, `driveAnswers` |
| `src/demo.ts` | Checks the stack under two envs, starts it, prints each member's origin, drives and inspection endpoint, then starts it again with `INSPECTION_ENABLED=false` |
| `src/stack.test.ts` | The stack through the real `spawnHost`: distinct ports, each drive served by its own member only, separate store folders and keypairs, inspection off on `a` and on for `b`; `INSPECTION_ENABLED` over both members; a protocol-contradicting env failing the start |
| `src/host-config.test.ts` | No server: `checkHost` on the compound, the switchboard runner's `hostSchema` on each rejected key, the `features.workflows` overlap, and `checkBoot` on a `readModel.url` without `storage` |
| `src/in-process.test.ts` | `runCompound` in the test process with `startSwitchboard` wrapped to record each member's config: per-member protocol, auth, inspection and stores, the shared `userDataDir`, `process.env` unchanged |

## Running

```bash
pnpm test    # four real compound starts (one, two at once, one that fails) and one in-process, 40 to 110 s
pnpm start
```

`vitest.config.ts` inlines `@powerhousedao/host-core` and ph-cli's switchboard runner chunks, so the `vi.mock` of `@powerhousedao/switchboard/server` in `in-process.test.ts` reaches the runner's import. It runs one test file at a time, since each file boots two switchboards.

## Operator env

The env applies to every member. In `src/stack.test.ts`:

| `spawnHost` `env` | `a` inspection | `b` inspection |
|-------------------|----------------|----------------|
| none | off (its own config) | on (its own config) |
| `INSPECTION_ENABLED: "false"` | off | off |
| `INSPECTION_ENABLED: "1"` | off | on: the flag reads only the literal strings `"true"` and `"false"`, so `"1"` sets nothing |

With `CREATE_SIGNATURE_POLICY: "v2-required"` the start fails. `sb-a` sets `"legacy"`, so the compound exits with code 1 before writing its run record, and `spawnHost` rejects with a `SpawnHostError` whose `phase` is `"exited"` and whose `outputTail` carries the conflict message. `sb-b` sets no `createSignaturePolicy` and would have accepted the value.

`checkHost("stack", { projectRoot, env })`, which `ph host check` runs, reports the same protocol conflict without starting anything. It checks both member files and names the one that conflicts (`stage: "boot"`, `file: "hosts/sb-a/host.js"`, `path: "reactor.protocol"`).

## What a spawned test cannot see

A `spawnHost` child exposes its run record, its endpoints and its data dir. The parsed config each member started with, and the parent's `process.env`, are only visible in the process that runs the compound. `src/in-process.test.ts` calls `runCompound` with `ctx.env` set to `PH_USER_DATA_DIR` (a temp dir) and `PH_NO_DOTENV`, and a compound object with `config.runtimeRecord: false` so nothing is written to the project's `.ph/run`. `spawnHost` refuses `runtimeRecord: false`, so `hosts/stack/host.js` leaves it unset.

The server module of `@powerhousedao/switchboard` still loads the project `.env` into `process.env` once, when it is imported, unless `process.env` itself has `PH_NO_DOTENV`. That is the server's, not the runner's. This recipe has no `.env`, so the test sees no change.

## Pitfalls

- **Isolation comes from the reactor block.** Give every member its own `storage` and `readModel.url`. A per-member `config.switchboard.storage.userDataDir` holds only when nothing sets `PH_USER_DATA_DIR`; under `spawnHost` both members share `dataDir`.
- **Files under `<userData>/.ph` are shared.** With one `userDataDir`, both members use `<dataDir>/.ph/.renown.json`, and both use `<dataDir>/.ph/.keypair.json` unless one sets `config.switchboard.identity.keypairPath`, as `sb-b` does.
- **Give `readModel.url` a `storage`.** A `readModel.url` without `storage` also holds the reactor store, which logs a deprecation at start; `checkBoot` and `ph host check` report it.
- **One member's conflict stops the compound.** An env value that only one member contradicts still fails the whole start.
- **Values are typed.** `config.switchboard.inspection.enabled` takes a boolean. The env strings (`"true"`, `"false"`) belong in the operator env only.
- **Removed exports.** `projectReactorToSwitchboard` and `SwitchboardReactorProjection` are gone from `@powerhousedao/host-core` from 6.2.3-dev.79 on. The merge logic lives in ph-cli's `member-config`, which is not an exported subpath.

## Requirements

`@powerhousedao/host-core`, `@powerhousedao/ph-cli` and `@powerhousedao/switchboard` 6.2.3-dev.79 from the workspace catalog. That is the first release with powerhouse PR #3314. In 6.2.3-dev.78 and earlier the runner wrote each member's reactor block into `process.env`, only where a variable was unset, so the second switchboard in a process started with the first one's values. `@powerhousedao/switchboard` is a dependency only so `in-process.test.ts` can mock and type its server and config modules.

Node 24 or later: ph-cli and the switchboard declare `engines.node >=24.0.0`.
