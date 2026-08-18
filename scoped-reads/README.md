# Scoped Reads

The same policy that refuses a write decides what a read returns. A subject
that may not read a scope does not receive it — the document comes back
without that key, not with an empty one — while the `auth` and `document`
scopes come back for every holder, so anyone can still evaluate the policy and
see the metadata.

Two things about *where* that happens are worth knowing first. It happens on
the `ReactorClient`, not in the reactor: `IReactor` is inside the trust
boundary and serves every scope of every document to every caller, so
`reactor.get()` and `client.get()` return different documents in the same
process. And it carries no feature flag of its own — a client over a reactor
with every flag off still filters reads, so a policy is enforced against
readers before it is enforced against writers.

This recipe picks up where [`document-acl`](../document-acl) (grant anatomy,
admission) and [`group-principals`](../group-principals) (a roster deciding who
may approve) stop. Those recipes drive a raw `ReactorBuilder` and so never see
a gate at all; this one builds a `ReactorClientBuilder` over the same kind of
reactor and reads one expense report as four identities.

## What it demonstrates

- **The gate is on the client** — in one process, on one document,
  `reactor.getByIdOrSlug()` serves all four scopes to anyone while
  `client.get()` serves Mallory only `auth` and `document`.
- **It carries no feature flag** — with `featureFlags: {}` the read is still
  filtered. Admission is staged behind flags; reading is not.
- **Per scope, not per document** — four identities get three views of one
  report, and a withheld scope is *absent* from `document.state` rather than
  present and empty.
- **An allow on execute confers read** — Alice holds no read grant at all. She
  reads `global` because she may write it, and she reads the whole scope even
  though her grant names a single operation: the operation list restricts what
  she may execute, not what she may see. The converse does not hold, so Carol
  reads the expenses and still cannot submit one.
- **A write hands back a read** — the document `client.execute()` returns is
  gated exactly like `get()`, as the client's own identity. Alice sees the
  scope she wrote and not the notes her policy withholds from her.
- **A `{ group }` read grant follows the roster** — offboarding Bob withdraws
  his `local` scope with no write to the report's policy at all; its
  `header.revision.auth` never moves.
- **Naming a group publishes its roster to that audience** — Carol reads the
  reviewers roster she is not on, past the roster's own Alice-only policy,
  because a replica must fold that membership to evaluate the report's grants.
  Mallory, whom the report serves nothing, does not. Below `authGroups` nobody
  does.

## The administration grant

`document-acl`, `revocation-race` and `group-principals` all install an
administration grant of `{ can: "execute", scope: "*" }`. Because an allow on
execute now confers read, that shape publishes **every** domain scope of the
document to whoever it names. Every administration grant in this recipe is
scoped to `auth`, which is all the auth-administration retention rule requires.

## The two domain scopes

A `PHDocument` has four state scopes — `auth`, `document`, `global` and
`local` — and the first two are always readable, so `global` and `local` are
the only pair a read can tell apart. This recipe puts the expenses in `global`
and the reviewers' confidential notes in `local`. `local` is conventionally
node-local data; it is used here as the second gateable scope because there is
no third.

## Running it

```sh
pnpm install
pnpm --filter @powerhousedao/example-scoped-reads start
```

## Version requirement

The read path ships in the monorepo's stage-7 work, which is newer than the
version this repo's catalog pins. Until a dev release carrying it is published
and the catalog is bumped, `build`, `test` and `start` pass only against a
local checkout of the monorepo:

```sh
cd ../powerhouse
pnpm build
pnpm test:e2e:recipes --filter scoped-reads --verbose
```

## Files

| Path | What it is |
| --- | --- |
| `src/demo.ts` | The narrated walkthrough, in six acts |
| `tests/scoped-reads.test.ts` | One test per claim above |
| `document-models/expense-report/` | The model: expenses in `global`, review notes in `local` |
