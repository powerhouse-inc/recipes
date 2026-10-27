# Host Check

Finding out that a host file is wrong by running it means one failure per attempt: an unset environment variable, then a bad field, then a boot precondition. `checkHost` from `@powerhousedao/host-core` runs the `ph run` pipeline up to the verb and reports every issue at once. It starts nothing. ph-cli exposes it as `ph host check`, behind `FEATURE_UNIFORM_RUNNERS_ENABLED` like `ph run` (powerhouse PR #3287).

## How it works

`checkHost(name, { projectRoot, env })` returns `{ issues, deferred }`. Each issue has a `stage`, the `file` it came from, a `path` inside it (empty when the issue is about the whole file), a `message` and an optional `hint`.

| Stage | What failed |
|-------|-------------|
| `load` | The host file or its runner module could not be loaded |
| `declared` | The file as written: a bad token, an unknown verb, a wrong shape |
| `resolve` | A token could not be resolved, such as an unset `$env` name |
| `resolved` | The resolved host fails the runner's schema |
| `boot` | The runner's startup preconditions, such as switchboard's worker pool needing Postgres |

`env` is the environment `ph run` would resolve against. `process.env` is never read, so a check in CI sees the deploy's variables and not the CI machine's.

Without `outputs`, `$output` tokens are checked as declared and listed in `deferred`, one `{ file, path, members }` entry per token. A host with no issues can still have deferred tokens, so an `ok` does not cover them.

## Architecture

| Module | Purpose |
|--------|---------|
| `hosts/switchboard` | A clean switchboard host on PGlite |
| `hosts/needs-env` | A host whose storage directory is `{ $env: "REACTOR_DATA_DIR" }` |
| `hosts/bad-runner` | A host naming a runner module the project does not install |
| `hosts/connect` | A Connect host whose drive URL reads the switchboard's output through `$output` |
| `src/check.ts` | `checkHosts`, a thin wrapper over `checkHost`, and `formatReport` |
| `src/demo.ts` | Checks the hosts under three environments; two fail on purpose. It exits 1 only when a host reports stages other than the ones the scenario expects |

What each host reports:

| Host | env | Result |
|------|-----|--------|
| `switchboard` | empty | ok |
| `switchboard` | `REACTOR_WORKERS=2` | `boot`: the worker pool needs a Postgres reactor database |
| `switchboard` | `REACTOR_WORKERS=2`, `PH_REACTOR_DATABASE_URL` set | ok |
| `needs-env` | empty | `resolve` at `reactor.backends.main.storage.dataDir` |
| `needs-env` | `REACTOR_DATA_DIR` set | ok |
| `bad-runner` | any | `load`, with a hint to install the runner |
| `connect` | any | ok, one deferred `$output` token |

## Running

```bash
pnpm test
pnpm start
```

The command line runs the same check. In this recipe, call the installed ph-cli binary (`npx ph` resolves an unrelated npm package):

```bash
FEATURE_UNIFORM_RUNNERS_ENABLED=1 pnpm exec ph-cli host check switchboard
FEATURE_UNIFORM_RUNNERS_ENABLED=1 pnpm exec ph-cli host check switchboard --env ci.env
```

| Option | Effect |
|--------|--------|
| `--env <file>` | Check against that file alone. Neither the project `.env` nor the shell environment is read |
| `--verb <verb>` | The verb to check at. Default `run` |

Without `--env`, the check reads the project `.env` and the shell environment, and the shell wins where both set a name. The output has the same format as `formatReport`. The exit code is 1 on any issue and 0 otherwise. Without `FEATURE_UNIFORM_RUNNERS_ENABLED`, `host check` is not a known subcommand.

## Requirements

`@powerhousedao/host-core` and `@powerhousedao/ph-cli` 6.2.3-dev.78 from the workspace catalog. `checkHost` and `ph host check` are published from 6.2.3-dev.74 on.

The hosts name `@powerhousedao/ph-cli/runners/switchboard` and `runners/connect`, so `ph-cli` is a dependency although `src` never imports it: `checkHost` resolves the runner from the project root.
