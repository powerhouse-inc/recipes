# Group Principals

Who may approve an expense is a question a **roster document** answers. The
expense report's policy names a [`reactor-group`](https://npmjs.com/package/@powerhousedao/reactor-group)
document with a `{ group: <documentId> }` principal, and the reactor folds that
roster's membership whenever it decides an approval. Hiring and offboarding are
single membership operations on the roster: no policy write, no per-document
sweep, every referencing document picks the change up at its next decision.

This recipe picks up where [`document-acl`](../document-acl) (grant anatomy,
admission) and [`revocation-race`](../revocation-race) (positional, convergent
verdicts) stop. It re-runs the revocation race where the revocation is a
**membership removal on a different document** than the one being judged.

## What it demonstrates

- **The `authGroups` flag**: third in the cascade
  (`documentDecisions` → `authEnforcement` → `authGroups`). Group principals
  never apply while it is off.
- **The roster is an ordinary document**: a `powerhouse/reactor-group` with
  `{ name, description, members }` state, replicated and event-sourced like
  everything else, and governed by its own auth scope, the policy in
  `state.auth`. The demo's roster is Alice-only, so Bob cannot enroll himself.
- **Hire/offboard is one operation**: `addMember` / `removeMember` on the
  roster. The expense report's auth scope never grows (the test asserts it
  stays at its genesis operation).
- **Membership is positional**: a `removeMember` timestamped *before* an
  already-accepted approval re-judges it: the reactor re-evaluates every
  document whose policy references the group, in that document's own job, and
  the approval flips to a stored denied operation.
- **Fail closed without the roster**: a replica that receives the expense
  report but not the roster document cannot fold membership, so the group
  principal matches nobody and the synced approval is denied there. When the
  roster's history arrives, the replica re-judges and converges with the
  origin, verdict for verdict.
- **No group can reference another group**: `assertValidGrant` throws
  `GroupPrincipalNotAllowedError` for a `{ group }` principal on a
  `powerhouse/reactor-group` document, so membership never chains and the
  fold is always one roster deep.

## Version requirement

Group principals shipped with the `authGroups` reactor stage. This recipe
needs `@powerhousedao/reactor`, `@powerhousedao/shared`, and
`@powerhousedao/reactor-group` from a release that carries it. Older releases
skip group grants entirely, as [`document-acl`](../document-acl) warns under
*Non-goals here*. Until such a release is on the `dev` dist-tag, run this
recipe through the monorepo's `test/recipes-e2e` link harness, which executes
it against a local checkout.

## Run it

```sh
pnpm install
pnpm test    # vitest: admission, positional flip, two-replica convergence
pnpm start   # narrated single-reactor walkthrough
```

The demo attaches unsigned signer context (`action.context.signer`) directly.
A production client populates and signs it via `ReactorClient.withSigner()`.
Signature verification is a separate, composable concern. See
[`signed-operations-verifier`](../signed-operations-verifier).

## The shape of the policy

```ts
{
  id: "g-reviewers-approve",
  description: "the reviewers group may approve expenses",
  effect: "allow",
  principal: { group: rosterDocumentId },
  capability: { can: "execute", scope: "global", operation: ["APPROVE_EXPENSE"] },
}
```

The roster's document id is data, so which humans that means is decided by
folding the roster's stream to the position of the operation being judged.
That fold happens locally at admission, and again on every replica during
replay. Access is never widened by absence.
