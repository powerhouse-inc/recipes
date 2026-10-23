# Host Check

Finding out that a host file is wrong by running it means one failure per attempt: an unset environment variable, then a bad field, then a boot precondition. `checkHost` from `@powerhousedao/host-core` runs the `ph run` pipeline up to the verb and reports every issue at once. It starts nothing. This is `ph host check`, behind `FEATURE_UNIFORM_RUNNERS_ENABLED` like `ph run` (powerhouse PR #3287).

## How it works

`checkHost(name, { projectRoot, env })` returns `{ issues, deferred }`. Each issue has a `stage`, the `file` it came from, a `path` inside it, a `message` and an optional `hint`.

| Stage | What failed |
|-------|-------------|
| `load` | The host file or its runner module could not be loaded |
| `declared` | The file as written: a bad token, an unknown verb, a wrong shape |
| `resolve` | A token could not be resolved, such as an unset `$env` name |
| `resolved` | The resolved host fails the runner's schema |
| `boot` | The runner's own startup preconditions, such as switchboard's, which the switchboard runner shares with its boot path |

`env` is the environment `ph run` would resolve against. `process.env` is never read, so a check in CI sees the deploy's variables and not the CI machine's. Without `outputs`, `$output` tokens are checked declared-only and listed in `deferred`.

## Architecture

| Module | Purpose |
|--------|---------|
| `hosts/switchboard` | A clean switchboard host on PGlite |
| `hosts/needs-env` | A host whose storage directory is `{ $env: "REACTOR_DATA_DIR" }` |
| `hosts/bad-runner` | A host naming a runner module the project does not install |
| `src/check.ts` | `checkHosts`, a thin wrapper over `checkHost`, and `formatReport` |
| `src/demo.ts` | Checks all three hosts under two environments and exits 1 on any issue |

## Running

```bash
pnpm test
pnpm start
```

From a project with hosts, the command line does the same:

```bash
FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph host check switchboard --env ci.env
```

`--env <file>` replaces the shell environment for the check. Without it the check sees the project `.env` under the shell environment. The exit code is 1 on any issue.

## Requirements

Needs a `@powerhousedao/host-core` release that exports `checkHost` (powerhouse PR #3287). The latest published version at the time of writing, 6.2.3-dev.73, does not. Raise the `pnpm-workspace.yaml` catalog to the first release that does. This recipe has not been run against a published build.
