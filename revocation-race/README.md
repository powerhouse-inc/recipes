# Revocation Race

Convergent authorization across reactors. Alice revokes Bob's approval grant on one
reactor (`@powerhousedao/reactor`, the Powerhouse node that stores documents and
applies their operations) while Bob approves an expense on another. **Both succeed
locally**, because no transaction spans two reactors. Both reactors still converge,
because each judges every operation **at its position in the merged order**.

## What it demonstrates

- **After syncing both directions, both reactors reach the same verdict**, each
  re-judging remote history at its own position. No origin verdict is shipped or
  trusted.
- **Denials are consensus artifacts**: a refused operation keeps its place in the
  stored stream with a reason from a closed, replicated set. Inspect with
  `isDenied` / `garbageCollect(sortOperations(...))`.
- **A late-arriving revocation retracts an already-applied approval** in the
  effective stream (see the view scope note in
  [`positional-delete`](../positional-delete)).

## The rejected alternative

The alternative is to judge an operation once, at its origin, and ship the verdict
with it. That verdict would be wrong the moment a concurrent policy change sorts
before the operation, and every reactor would then have to either trust it
(divergence) or re-derive it anyway.

## Policy setup

Grants name a scope: `auth` holds the policy stream, `global` holds domain
operations, and `*` covers every scope.

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-submit` | allow | anyone | `execute` `SUBMIT_EXPENSE` on `global` |
| `g-bob-approve` | allow | Bob | `execute` `APPROVE_EXPENSE` on `global` |

Only Alice's reactor ever writes the auth scope, deliberately. The auth stream is
strictly timestamp-monotonic (a backdated policy edit is refused with
`AuthTimestampNotMonotonicError`) and is never reshuffled, so concurrent policy edits
from multiple reactors can conflict on merge. Positional judgment works only because
the policy stream itself has one authoritative order.

## State shape

```graphql
type ExpenseReportState {
  expenses: [Expense!]!
}

type Expense {
  id: ID!
  memo: String!
  amountCents: Int!
  status: ExpenseStatus!   # PENDING | APPROVED
  approvedBy: String
}
```

`SUBMIT_EXPENSE` and `APPROVE_EXPENSE` reducers validate domain invariants only
(duplicate id, unknown expense, double approval). Who may approve is platform policy.

## Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

The demo runs the race twice on one `expense-report` document, with wall-clock
ordering both times. When the revocation sorts first, both reactors deny the
approval: the expense stays `PENDING` and the refusal is stored with
`deniedReason: "no grant permits this operation"`. When the approval sorts first,
both reactors keep it and the expense is `APPROVED`.

## Tests

```sh
pnpm test
```

`tests/revocation-race.test.ts` covers both race orderings converging on both
reactors (with the denied reason pinned to `AUTH_NO_GRANT_REASON`), origin refusal
once the revocation is known, and the backdated-auth-operation guard.

## Related recipes

- [`document-acl`](../document-acl): the grant stack this recipe races (principals,
  capabilities, last-applicable-grant-wins).
- [`positional-delete`](../positional-delete): the same positional machinery applied
  to deletion, including the load-path vs retraction-path view guarantee.
