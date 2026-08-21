# Auth Preflight

Every other auth recipe here shows the reactor refusing a write **after** it
arrives, as a failed job or a stored `deniedReason`. This recipe asks first.
`evaluateActions` answers what the reactor *would* decide about a batch of
candidate operations, without submitting any of them, so a UI can disable a
control rather than offer one that fails.

## What it demonstrates

The batch is predicted first, then every candidate is actually executed, and the
verdicts are compared one for one. Prediction and submit decide through the
reactor's own decision model, at the same stream heads. A refusal carries
the consensus string the reactor would have recorded
(`no grant permits this operation`). `anyAllowed` and `allAllowed` answer what a
toolbar and a form each ask, and every aggregate is false over an empty batch.

## The policy

This recipe picks up where [`document-acl`](../document-acl) leaves off, with the
policy ordinary state in the document's `auth` scope. Two roles over one expense
report: the manager is unrestricted in the `global` scope, and the clerk may
submit, but only below the approval threshold. That limit is a condition on the
action's own input, not a rule in the reducer:

```ts
{
  id: "g-clerk-small",
  effect: "allow",
  principal: { address: CLERK },
  capability: { can: "execute", scope: "global", operation: ["SUBMIT_EXPENSE"] },
  where: { lt: [{ attr: "action.input.amountCents" }, { lit: 50_000 }] },
}
```

This recipe is the first in the repo to turn on `authConditions`, which is what
makes a `where` clause apply at all. Below that flag a conditional grant never
matches, so it fails closed, and the preflight fails closed with it. Because the
grant reads `action.input.amountCents`, the prediction follows the amount the
form currently holds, and denies until one is typed.

## A prediction, not a promise

An allow is obtained, the grant behind it is revoked, and the very same submit is
refused. The submit path stays the only authority. A reactor without
`authEnforcement` holds no decision model and throws
`AuthEnforcementDisabledError`. A caller reads that error as "cannot know" and
leaves its controls alone, never as a refusal that would grey out every button
wherever enforcement is off.

## What it does not cover

The preflight is not the legacy host-side permission tables, which refuse with
`Forbidden: insufficient permissions` rather than with a verdict. It has two other
transports, neither exercisable from a Node recipe: `useCanExecute` in
`@powerhousedao/reactor-browser` wraps it for React, and the reactor subgraph
serves it as an `evaluateActions` GraphQL query through
`createReactorGraphQLClient`.

## Running it

`evaluateActions` ships in `6.2.2-dev.52`, which this repo's catalog pins, so the
recipe runs standalone:

```sh
pnpm install
pnpm test    # vitest: agreement, aggregates, conditions, routing, staleness
pnpm start   # narrated walkthrough in five acts
```

`src/demo.ts` prints predicted against actual for every candidate, then plays the
staleness and flags-off acts. `tests/auth-preflight.test.ts` holds one test per
claim in this README.
