# Document ACL

A custom `team-journal` document model whose write access is governed entirely by the
platform auth scope — no authorization code in any reducer. Policy lives in the
document as ordinary replicated state (`state.auth`), is edited with four platform
actions, and is enforced at admission by the reactor when the `authEnforcement`
feature flag is on.

This recipe is the deliberate counterpart to [`role-based-auth`](../role-based-auth):
same outcome (callers gated per operation), opposite mechanism. There, every reducer
starts with signer checks and the rules are baked into the model. Here the reducers
validate domain invariants only, and the rules are data — inspectable, replicated,
and changeable at runtime without touching the model.

## What it demonstrates

- **The cascading feature flags** — `authEnforcement` requires `documentDecisions`;
  the builder validates the combination eagerly and rejects unknown flag names.
- **Open until initialized** — an uninitialized policy (`state.auth.version === 0`)
  leaves the document open; `initializeAuth` flips the default to deny.
- **Grant anatomy** — principals (`{anyone}`, `{address}`), capabilities with exact
  operation lists (`{can: "execute", scope: "global", operation: ["ADD_ENTRY"]}`),
  allow and deny effects.
- **Last applicable grant wins** — a deny appended after an allow refuses what the
  allow permitted, and `moveGrant` changes the verdict without changing any grant.
- **The auth scope is just another scope** — who may edit the policy is itself
  policy: a grant on `scope: "auth"`.
- **Admission-level refusal** — a denied write fails the job with
  `AuthorizationDeniedError` and nothing is stored; the reducer never runs.
- **Self-lockout guardrail** — an initial policy with no reachable auth-administration
  grant is refused by the platform reducer.

## The policy the demo installs

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-add` | allow | anyone | `execute` `ADD_ENTRY` on scope `global` |

Evaluation is **default deny, last applicable grant wins**. The demo then appends
`g-deny-bob` (deny Bob `ADD_ENTRY`) — Bob is refused; moves it to index 0 — the
later `g-anyone-add` wins again and Bob is back. Order decides, not existence.

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

The flags govern **enforcement only** — the auth data model is always live. A policy
written on a flags-on reactor is silently unenforced on a flags-off reactor, which is
why the flags flip per document-sharing fleet, never per node. Asking for
`authEnforcement` without `documentDecisions` throws at build time, as does any flag
name this reactor version doesn't know.

## State shape

```graphql
type TeamJournalState {
  title: String!
  entries: [JournalEntry!]!
}

type JournalEntry {
  id: ID!
  author: String!
  text: String!
  pinned: Boolean!
}
```

The reducers (`document-models/team-journal/v1/src/reducers/journal.ts`) throw
`DuplicateEntry` / `EntryNotFound` — domain invariants — and read the signer only to
record an entry's `author` for display. There is no access check anywhere in the
model.

## Gotchas worth knowing

- **One scope per `execute`** — all actions in a single `reactor.execute` call must
  share a scope, so policy changes (`scope: "auth"`) can't be batched with domain
  actions (`scope: "global"`).
- **The auth stream is strictly timestamp-monotonic** — two policy edits in the same
  millisecond are refused (`AuthTimestampNotMonotonicError`), and auth operations are
  never reshuffled. The demo and tests space auth writes by a few milliseconds.
- **Signer context** — the demo attaches `action.context.signer` by hand to play two
  callers from one process. In production the `ReactorClient` populates and signs it
  via `.withSigner(...)` (see the [`audit-trail`](../audit-trail) recipe for a real
  `RenownCryptoSigner` setup).
- **Unsigned documents have no creator carve-out** — a document created without a
  signing key must include a reachable auth-administration grant in its initial
  policy, or `initializeAuth` is refused.

## Non-goals (not shipped yet)

Grants with a `{group: ...}` or `{match: ...}` principal, or a `where` condition,
parse and store today but **never match** — the evaluator skips them until the
`authGroups` / `authConditions` stages ship. Don't demo a group grant and conclude
enforcement is broken.

## Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

The demo walks: Bob writes before any policy exists, Alice initializes the three-grant
policy, Bob's `ADD_ENTRY` still lands while `SET_TITLE` / `PIN_ENTRY` / `SET_GRANT`
are refused, Alice stacks a deny on Bob, reorders it with `moveGrant`, and retires it
with `removeGrant`.

## Tests

```sh
pnpm test
```

`tests/enforcement.test.ts` runs the same behaviors against a real flags-on reactor,
including proof that a denied write stores nothing, plus the self-lockout guardrail
(surfaced as `operation.error`, not a failed job). The generated model tests live
under `document-models/team-journal/v1/tests/`.

## Regenerating

The document-model spec lives in `document-models/team-journal/team-journal.json`.
To regenerate the `gen/` tree after editing it:

```sh
pnpm run generate
```

The reducer implementations in `v1/src/reducers/` are scaffolded once and then left
alone by codegen.

## License

AGPL-3.0-only
