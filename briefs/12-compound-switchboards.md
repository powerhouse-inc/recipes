# Recipe brief: compound-switchboards

**One-liner:** Two switchboards in one `ph run` process, each with its own reactor
block and `config.switchboard`, and no env written between them (powerhouse PR #3314).

## Why this recipe

No recipe runs a compound of switchboards. `spawn-host` and `host-check` use one
switchboard host; `host-output-tokens` resolves tokens against canned data. Since
PR #3314 the switchboard runner writes no env: a member's config is its `reactor`
block plus `config.switchboard` (`auth`, `inspection`, `workers`, `storage`,
`packages`, `features`), with the operator's env over both. That makes two
differently configured switchboards in one process possible, and nothing shows how.

## Blocked on a release

The catalog pins 6.2.3-dev.78, which predates #3314. Build this recipe once a dev
release carries it, and bump the catalog in the same PR.

## What it demonstrates

- A compound host (`runner.module: "@powerhousedao/host-core/runners/compound"`)
  with children `a` and `b`, each a switchboard host on `port: 0`.
- Per-member `reactor.backends.main.storage` and `readModel.url`, plus
  `config.switchboard.storage.userDataDir`, so the members share no store.
- Per-member `reactor.protocol` and `config.switchboard.auth` / `inspection`
  that differ, observable through each member's endpoints (for example
  `/graphql/inspection` answers on one member only).
- Operator env still winning: a shell variable overrides both members' file values.
- Isolation: `process.env` is unchanged after the compound starts.

## Reference code

In powerhouse at PR #3314:

- `clis/ph-cli/test/compound-switchboards.test.ts`: the two-member fixture and the
  isolation assertions to port.
- `clis/ph-cli/src/runners/member-config.ts`: how env and the two config blocks merge.
- `clis/ph-cli/schemas/runner-switchboard.schema.json`: the `config.switchboard` shape.

## Suggested shape

- `hosts/sb-a/host.js`, `hosts/sb-b/host.js`, `hosts/stack/host.js` (the compound).
- `src/demo.ts`: `spawnHost` the compound, print each member's origin and drive,
  hit each member's inspection endpoint.
- `src/stack.test.ts`: real spawn; assert distinct ports and drives, one inspection
  endpoint answering, and the project's `.ph` untouched.

## Pitfalls

- Set `config.runtimeRecord` to true on the compound if `spawnHost` launches it;
  `spawnHost` refuses compounds with `runtimeRecord: false`.
- A `readModel.url` without `storage` logs a deprecation; give every member `storage`.
- Code that imported `projectReactorToSwitchboard` or `SwitchboardReactorProjection`
  from host-core breaks; neither exists after #3314.
