# Recipe brief: compound-switchboards

**One-liner:** Two switchboards in one `ph run` process, each with its own reactor
block and `config.switchboard`, and no env written between them (powerhouse PR #3314).

## Why this recipe

No recipe runs a compound of switchboards. `spawn-host` and `host-check` use one
switchboard host; `host-output-tokens` resolves tokens against canned data. Since
PR #3314 the switchboard runner writes no env: a member's config is its `reactor`
block plus `config.switchboard` (for example `auth`, `inspection`, `workers`,
`storage`, `packages`, `features`), with the operator's env over both. That makes
two differently configured switchboards in one process possible, and nothing shows how.

**Release:** #3314 ships in 6.2.3-dev.79 (published 2026-10-28; tag `v6.2.3-dev.79`
is 19 commits ahead of merge commit `dffb399`). In 6.2.3-dev.79, ph-cli has
`member-config` and host-core no longer exports `projectReactorToSwitchboard`; in
6.2.3-dev.78 it is the other way round. The recipe needs the root catalog at
6.2.3-dev.79 or later.

## What it demonstrates

- A compound host (`runner.module: "@powerhousedao/host-core/runners/compound"`)
  with children `a` and `b`, each a switchboard host on `port: 0`.
- Per-member `reactor.backends.main.storage` and `readModel.url`, so the members
  share no reactor store or read model.
- Per-member `config.switchboard.inspection` that differs and is observable from
  outside. The fixture gives `a` `inspection: { enabled: false }` and `b`
  `{ enabled: true, callsPerMinute: 7 }`; POST `{ __typename }` to
  `/graphql/inspection` and expect `a` not to answer and `b` to.
- Operator env over both members' file values, for the keys env may override.
  `spawnHost({ env: { INSPECTION_ENABLED: "false" } })` turns off `b`'s inspection
  endpoint (only the literal strings `"true"` and `"false"` count).
- What only an in-process test can see. The powerhouse test calls `runCompound` and
  mocks `startSwitchboard` to capture each member's parsed config. That is how it
  asserts the differing `reactor.protocol` and `config.switchboard.auth`, and that
  `process.env` is unchanged after the compound starts. A `spawnHost` child exposes
  none of this to the test, so port those assertions to a separate in-process test
  or leave them out.

## Reference packages

`@powerhousedao/ph-cli`, `@powerhousedao/host-core` and `@powerhousedao/switchboard`
at 6.2.3-dev.79. Source in powerhouse at merge commit
`dffb3993d8d197e0f721b461ce0d248fc2567df6`:

- `clis/ph-cli/test/compound-switchboards.test.ts`: the two-member fixture and the
  isolation assertions to port.
- `clis/ph-cli/src/runners/member-config.ts`: how env and the two config blocks
  merge, and which `config.switchboard` keys are omitted.
- `clis/ph-cli/test/member-config.test.ts`: the precedence cases.
- `clis/ph-cli/schemas/runner-switchboard.schema.json`: the `config.switchboard`
  shape. It is in the repo only; the npm package ships `dist` alone.

## Suggested shape

- `hosts/sb-a/host.js`, `hosts/sb-b/host.js`, `hosts/stack/host.js` (the compound).
- `src/demo.ts`: `spawnHost` the compound, print each member's origin and drive
  from the result's `members.a.outputs` and `members.b.outputs`, hit each member's
  inspection endpoint.
- `src/stack.test.ts`: real spawn; assert distinct ports and drives, one inspection
  endpoint answering, the env override above, and the project's `.ph` untouched.

## Implementation notes & pitfalls

- Use `runner.module: "@powerhousedao/ph-cli/runners/switchboard"` for the members,
  as `spawn-host/hosts/switchboard/host.js` does. The powerhouse fixture points at
  the runner's source file.
- Do not copy `config.runtimeRecord: false` from the powerhouse fixture (it calls
  `runCompound`, not `spawnHost`). `spawnHost` refuses a compound with that value;
  leave it unset.
- `spawnHost` always sets `PH_USER_DATA_DIR` to its `dataDir`, and env wins over
  `config.switchboard`, so under `spawnHost` both members get that dir as
  `storage.userDataDir` whatever the host file says. Per-member `userDataDir` only
  holds in-process (the powerhouse test passes an empty env). Keep the members
  apart through their reactor `storage` and `readModel.url`.
- The env does not win everywhere. It never overrides a member's `readModel`; only
  a shell `PH_REACTOR_DATABASE_URL` overrides its reactor store; and an env var that
  contradicts the member's `reactor.protocol` fails the start instead of overriding
  it. `spawnHost` sets `PH_NO_DOTENV=1`, so its `env` option is the only operator env.
- `config.switchboard` is strict. Keys that belong to the reactor block or the
  runner (`storage.reactor`, `storage.readModel`, `protocol`, `packages.dynamic`,
  `server.port`, `server.dev`, `drive`, `remoteDrives`, `features.pluginHost`,
  `processorConfig`, `logLevel`) are rejected, and a key the reactor block also sets
  fails validation.
- A `readModel.url` without `storage` logs a deprecation; give every member `storage`.
- Code that imported `projectReactorToSwitchboard` or `SwitchboardReactorProjection`
  from host-core breaks; neither exists after #3314.

## Related recipes in this repo

- `spawn-host` — `spawnHost` on a single switchboard; the base this recipe extends.
- `host-check` — `ph host check` on single hosts; since #3314 it also flags a
  switchboard `readModel.url` without `storage`.
- `host-output-tokens` — output tokens a compound member can consume from another.
