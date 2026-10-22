# Host Output Tokens

A host file (`hosts/<name>/host.js`) that needs a value another host produces at runtime, such as the URL of a drive a switchboard serves, without hardcoding a port. The host writes a plain-JSON **output token** and `@powerhousedao/host-core` resolves it from what the producer actually bound. This is the typed-host-configs feature in `docs/plans/2026-10-19-typed-host-configs.md` of the powerhouse repo, behind `FEATURE_UNIFORM_RUNNERS_ENABLED`.

## How it works

A token is an object whose only key is an operator. Host files stay JSON: no imports of sibling hosts, no `process.env`.

| Token | Resolves to |
|-------|-------------|
| `{ $output: { host, path } }` | the value at `path` in that host's outputs |
| `{ $concat: [...] }` | a string joined from strings, numbers and other tokens |
| `{ $env: "NAME" }` | the environment variable (`{ name, optional: true }` omits the field when unset) |
| `{ $map: { over, to, into? } }` | `to` rendered once per element of `over` |

`resolveHostOutputs(host, { outputs, env })` replaces every token. `outputs` is an `OutputSource`: in `ph run` it is a live compound member or the producer's run record, and here it is canned data.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/hosts.ts` | A switchboard host and a Connect host whose drive URLs are tokens |
| `src/resolve.ts` | `cannedOutputs` and `resolveHost`, a thin wrapper over `resolveHostOutputs` |
| `src/demo.ts` | Resolves the same Connect host against two different bound ports |

## Running

```bash
pnpm test
pnpm start
```

## Requirements

Needs `@powerhousedao/host-core` 6.2.3-dev.71 or later, which exports `resolveHostOutputs` (powerhouse PR #3258). It is not exported from 6.2.3-dev.69 or earlier. The recipe takes host-core from the workspace catalog, which pins 6.2.3-dev.71.
