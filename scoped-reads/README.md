# Scoped Reads

The same policy that refuses a write decides what a read returns. A subject
that may not read a scope does not receive it. `IReactor` is inside the trust
boundary and serves every scope of every document to every caller, so the gate
sits on the `ReactorClient`, which [`document-acl`](../document-acl) and
[`group-principals`](../group-principals) never build.

## What it demonstrates

- **The gate is on the client**: `reactor.getByIdOrSlug()` serves all four
  scopes to anyone while `client.get()` serves Mallory only `auth` and
  `document`.
- **Per scope, not per document**: four identities get three views, and a
  withheld scope is *absent* from `document.state` rather than present and
  empty. `client.execute()` hands back a document gated as the client's own
  identity.
- **The read gate carries no feature flag**: with `featureFlags: {}` the read
  is filtered, while admission waits on `authEnforcement`.

## An allow on execute confers read

Alice holds no read grant. She reads all of `global` because she may write one
operation in it: the operation list restricts what she may execute, not what
she may see. A read grant does not confer execute: Carol reads the expenses
and cannot submit one.

`document-acl`, `revocation-race` and `group-principals` all install an
administration grant of `{ can: "execute", scope: "*" }`, which now publishes
**every** domain scope to whoever it names. The grant here is scoped to `auth`,
which is all the auth-administration retention rule requires: a policy has to
leave some subject able to execute `SET_GRANT` on `auth`, and nothing wider.

## A `{ group }` read grant follows the roster

Offboarding Bob withdraws his `global` and `local` scopes with no write to the
report's policy, and `header.revision.auth` never moves.

Naming a group publishes its roster to the naming document's audience. Carol
reads the reviewers roster she is not on, past its Alice-only policy, because
the report's `{ group }` grants cannot be evaluated without the member list.
Mallory, whom the report serves nothing, does not.

## The two domain scopes

Of a `PHDocument`'s four state scopes, `auth` and `document` come back for
every holder, so anyone can evaluate the policy and see the metadata. That
leaves `global` and `local` as the only pair a read can tell apart. The
expenses go in `global`, the reviewers' confidential notes in `local`,
conventionally node-local data.

## Running it

```sh
pnpm install
pnpm --filter @powerhousedao/example-scoped-reads start
```

`src/demo.ts` is the narrated walkthrough, and `tests/scoped-reads.test.ts`
holds one test per act of it, plus two with the feature flags off.

## Version requirement

Per-scope read filtering is newer than `6.2.2-dev.52`, which this repo's
catalog pins in `pnpm-workspace.yaml`. Until a dev release carrying it is
published and the catalog bumped, `build`, `test` and `start` pass only
against a local checkout of the monorepo:

```sh
cd ../powerhouse
pnpm build
pnpm test:e2e:recipes --filter scoped-reads --verbose
```
