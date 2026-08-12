# Group Principals

Who may approve an expense is a question a **roster document** answers. The
expense report's policy names a [`reactor-group`](https://npmjs.com/package/@powerhousedao/reactor-group)
document with a `{ group: <documentId> }` principal, and the reactor folds that
roster's membership — at each operation's position — whenever it decides an
approval. Hiring and offboarding are single membership operations on the
roster: no policy write, no per-document sweep, every referencing document
picks the change up at its next decision.

This recipe picks up where [`document-acl`](../document-acl) (grant anatomy,
admission) and [`revocation-race`](../revocation-race) (positional, convergent
verdicts) stop: it re-runs the revocation race where the revocation is a
**membership removal on a different document** than the one being judged.

## What it demonstrates

- **The `authGroups` flag** — third in the cascade
  (`documentDecisions` → `authEnforcement` → `authGroups`); group principals
  never apply while it is off.
- **The roster is an ordinary document** — a `powerhouse/reactor-group` with
  `{ name, description, members }` state, replicated and event-sourced like
  everything else, and governed by its own auth scope: the demo's roster is
  Alice-only, so Bob cannot enroll himself.
- **Hire/offboard is one operation** — `addMember` / `removeMember` on the
  roster; the expense report's auth stream never grows (the test asserts it
  stays at its genesis operation).
- **Membership is positional** — a `removeMember` timestamped *before* an
  already-accepted approval re-judges it: the reactor re-evaluates every
  document whose policy references the group, in that document's own job, and
  the approval flips to a stored denied operation.
- **Fail closed without the roster** — a replica that receives the expense
  report but not the roster document cannot fold membership, so the group
  principal matches nobody and the synced approval is denied there. When the
  roster's history arrives, the replica re-judges and converges with the
  origin, verdict for verdict.
- **No group can reference another group** — the platform rejects `{ group }`
  principals on a group document's own policy, so membership never chains and
  the read-set stays flat.

## Version requirement

Group principals shipped with the `authGroups` reactor stage. This recipe
needs `@powerhousedao/reactor`, `@powerhousedao/shared`, and
`@powerhousedao/reactor-group` from a release that carries it — older
releases skip group grants entirely (that is what the disclaimers in the
other auth recipes describe). Until such a release is on the `dev` dist-tag,
run this recipe through the monorepo's `test/recipes-e2e` link harness, which
executes it against a local checkout.

## Run it

```sh
pnpm install
pnpm test    # vitest: admission, positional flip, two-replica convergence
pnpm start   # narrated single-reactor walkthrough
```

The demo attaches unsigned signer context (`action.context.signer`) directly;
a production client populates and signs it via `ReactorClient.withSigner()`.
Signature verification is a separate, composable concern — see
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
folding the roster's stream to the position of the operation being judged —
locally at admission, and again on every replica during replay. A replica
holding the same operations reaches the same verdicts; a replica missing the
roster denies until it arrives. Access is never widened by absence.
