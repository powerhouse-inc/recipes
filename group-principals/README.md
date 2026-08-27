# Group Principals

Who may approve an expense is a question a **roster document** answers. The
expense report's policy names a [`reactor-group`](https://npmjs.com/package/@powerhousedao/reactor-group)
document with a `{ group: <documentId> }` principal, and the reactor folds that
roster's membership whenever it decides an approval.

This recipe re-runs [`revocation-race`](../revocation-race) with the revocation
as a **membership removal on a different document** than the one being judged.

## What it demonstrates

- **Hire/offboard is one operation**: `addMember` / `removeMember` on the
  roster. No policy write, no per-document sweep.
- **The roster is an ordinary document**: a `powerhouse/reactor-group` governed
  by its own Alice-only auth scope, so Bob cannot enroll himself.
- **Membership is positional**: a `removeMember` timestamped *before* an
  accepted approval re-judges it, and the approval flips to a stored denial.
- **Fail closed without the roster**: a replica that cannot fold membership
  denies the synced approval, and converges when the roster's history arrives.

## Run it

Group principals apply only with `authGroups`, third of the reactor's cascading
auth flags (`documentDecisions` → `authEnforcement` → `authGroups`). Below
`authGroups` a `{ group }` grant parses and stores but never matches, as
[`document-acl`](../document-acl) warns. The catalog pins `6.2.2-dev.62`, which
carries that flag.

```sh
pnpm install
pnpm test    # vitest: admission, positional flip, two-replica convergence
pnpm start   # narrated single-reactor walkthrough
```

The demo attaches unsigned signer context (`action.context.signer`) directly. A
production client populates and signs it via `ReactorClient.withSigner()`, and
verifying those signatures is a separate concern
([`signed-operations-verifier`](../signed-operations-verifier)).

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

The roster's document id is data, so which humans the grant covers is decided
by folding the roster's stream to the position of the operation being judged. A
`{ group }` grant on a roster is itself refused (`assertValidGrant` throws
`GroupPrincipalNotAllowedError`), so the fold is always one roster deep.
