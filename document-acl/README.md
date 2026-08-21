# Document ACL

A `team-journal` document model whose writes are governed by the platform auth scope,
with no authorization code in any reducer. Policy lives in the document as
replicated state (`state.auth`), edited with `initializeAuth`, `setGrant`, `moveGrant`,
and `removeGrant`, and enforced at admission when the `authEnforcement` feature flag is
on. [`role-based-auth`](../role-based-auth) reaches the same outcome with the rules
baked into its reducers.

## What it demonstrates

An uninitialized policy (`state.auth.version === 0`) leaves the document open, and
`initializeAuth` flips the default to deny. A write that no grant covers fails the job
`reactor.execute` returns, with `AuthorizationDeniedError`. Nothing is stored and the
reducer never runs.

The reducers (`document-models/team-journal/v1/src/reducers/journal.ts`) throw
`DuplicateEntry` and `EntryNotFound` for domain invariants, and read the signer only
for an entry's `author`.

## The policy the demo installs

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-add` | allow | anyone | `execute` `ADD_ENTRY` on scope `global` |

Evaluation is **default deny, last applicable grant wins**. `SET_GRANT` is judged
against scope `auth`, which only Alice holds, so Bob's is refused. The demo appends
`g-deny-bob` (deny Bob `ADD_ENTRY`) after those three and his next entry fails.
`moveGrant` sends that deny to index 0, `g-anyone-add` is last again, and Bob is back.

## The feature flags

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([TeamJournal, documentModelDocumentModelModule])
  .withExecutorConfig({
    featureFlags: {
      documentDecisions: true, // decision model replaces the meta-cache gate
      authEnforcement: true,   // auth projection; requires documentDecisions
    },
  })
  .build();
```

The flags govern **enforcement only**. The auth data model is always live, so a policy
written on a flags-on reactor is silently unenforced on a flags-off one, where
`selectDecisionModel` leaves the auth scope out of every append condition. Flip the
flags per fleet of reactors that sync the same documents, never per node. Asking for
`authEnforcement` without `documentDecisions` throws at build time.

## Gotchas worth knowing

- **One scope per `execute`**: actions in one `reactor.execute` call must share a
  scope, so policy changes (`scope: "auth"`) can't be batched with domain actions
  (`scope: "global"`).
- **The auth stream is strictly timestamp-monotonic**: two policy edits in the same
  millisecond are refused (`AuthTimestampNotMonotonicError`), so the demo and tests
  space auth writes by a few milliseconds.
- **Unsigned documents have no creator carve-out**: without a signing key, the initial
  policy must include a reachable `execute` grant on scope `auth`, or the platform
  reducer refuses `initializeAuth`. Reachable means not shadowed by a later deny.

## Non-goals here

Grants with a `{group: ...}` or `{match: ...}` principal, or a `where` condition, parse
and store but **never match** without the `authGroups` / `authConditions` flags. The
evaluator skips them silently: check the flags before concluding enforcement is
broken. [`group-principals`](../group-principals) covers group grants.

## Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

## Tests

```sh
pnpm test
```

`tests/enforcement.test.ts` runs these behaviors on a flags-on reactor, plus the
self-lockout guardrail, surfaced as `operation.error`, not a failed job.
