# Revocation Race

Convergent authorization across reactors. A reactor (`@powerhousedao/reactor`) is the
Powerhouse node that stores documents and applies their operations. Alice revokes
Bob's approval grant on one reactor while Bob approves an expense on another.
**Both succeed locally**, because no transaction spans two reactors. What keeps the
fleet honest is that every reactor judges every operation **at its position in the
merged order**. After syncing both directions, both reactors independently reach the
same verdict, and no origin verdict is shipped or trusted.

The demo runs the race twice on one `expense-report` document, with honest wall-clock
ordering both times:

- **Revocation sorts first** → both reactors deny the approval. The expense stays
  `PENDING`, and the refused approval is stored with
  `deniedReason: "no grant permits this operation"`.
- **Approval sorts first** → both reactors keep it. The expense is `APPROVED` and
  records Bob as approver.

## What it demonstrates

- **One rule, two times.** Enforcement is *preventive* locally: a fresh approval
  fails at origin once the revocation is known, and nothing is stored. Across
  reactors it is *convergent*: remote history is re-judged on arrival at its own
  position.
- **Denials are consensus artifacts**: a refused operation keeps its place in the
  stored stream with a reason from a closed, replicated set. Inspect with
  `isDenied` / `garbageCollect(sortOperations(...))`.
- **Re-judgment on late policy arrival**: when the revocation reaches the reactor
  that had already applied the approval, that reactor retracts it in the effective
  stream (see the view scope note in [`positional-delete`](../positional-delete)).
- **The auth stream is strictly timestamp-monotonic**: a backdated policy edit is
  refused outright (`AuthTimestampNotMonotonicError`), and auth operations are never
  reshuffled. Positional judgment of domain operations only works because the policy
  stream itself has one authoritative order.

## The rejected alternative

The simplest-looking design is to judge an operation once, at its origin, and ship
the verdict with it. That verdict would be wrong the moment a concurrent policy
change sorts before the operation, and every reactor would then have to either trust
it (divergence) or re-derive it anyway. Position-based judgment makes the verdict a
pure function of the merged history, so agreement on history *is* agreement on
authorization.

## Policy setup

| id | effect | principal | capability |
|---|---|---|---|
| `g-alice-admin` | allow | Alice | `execute` on scope `auth` |
| `g-alice-all` | allow | Alice | `execute` on scope `*` |
| `g-anyone-submit` | allow | anyone | `execute` `SUBMIT_EXPENSE` on `global` |
| `g-bob-approve` | allow | Bob | `execute` `APPROVE_EXPENSE` on `global` |

Only Alice's reactor ever writes the auth scope. That is a deliberate pattern, not
just demo simplification. Because the auth stream must stay strictly monotonic and is
never reshuffled, concurrent policy edits from multiple reactors can conflict on
merge. A single policy-writing home (or coordinated administration) avoids that class
of problem entirely.

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

## Tests

```sh
pnpm test
```

`tests/revocation-race.test.ts` covers both race orderings converging on both
reactors (with the denied reason pinned to the platform's consensus constant
`AUTH_NO_GRANT_REASON`), origin refusal once the revocation is known, and the
backdated-auth-operation guard.

## Regenerating

The document-model spec lives in
`document-models/expense-report/expense-report.json`:

```sh
pnpm run generate
```

## Related recipes

- [`document-acl`](../document-acl): the grant stack this recipe races (principals,
  capabilities, last-applicable-grant-wins).
- [`positional-delete`](../positional-delete): the same positional machinery applied
  to deletion, including the load-path vs retraction-path view guarantee.

## License

AGPL-3.0-only
