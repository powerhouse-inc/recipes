# Recipe brief: derived-invariants

**One-liner:** Reducers that recompute derived rollups (budget totals, polymorphic
progress) from first principles after every mutating operation, and auto-advance
status when a threshold is crossed — denormalized values that can never go stale.

## Why this recipe

`role-based-auth` is currently the only recipe about reducer craft. The registry's
best counterpart is `@powerhousedao/project-management`: its ScopeOfWork model calls
`applyInvariants(state, [...])` at the end of every mutating reducer to recompute
project budgets and milestone progress, including a genuinely tricky bit — rolling up
progress across deliverables that use *different* progress types (Binary, Percentage,
StoryPoints) — and auto-transitioning a deliverable to `DELIVERED` when its progress
reaches completion. It's a clean, testable lesson in where derived state belongs and
how to keep it consistent without a processor.

## What it demonstrates

- The `applyInvariants(state, updates)` pattern: a pure helper invoked at the end of
  each mutating reducer, recomputing derived fields from source-of-truth fields.
- Polymorphic progress rollup: a deliverable set mixing
  `Binary | Percentage | StoryPoints` (story-points-only sets sum points; mixed sets
  average percentage-equivalents with Binary IN_PROGRESS = 50%, done = 100%).
- Status auto-transition inside a reducer (progress hits completion → status becomes
  `DELIVERED`, no separate operation).
- The design tradeoff: recompute-in-reducer vs. a processor-maintained read model.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__project-management`**
  - `dist/document-models/scope-of-work/src/reducers/projects.js` — verified:
    `applyInvariants`, `calculateTotalBudget`, `calculateDeliverableSetProgress` (plus
    `calculateTotalCost`). Read this file first; it IS the recipe, at production scale.
  - `dist/document-models/scope-of-work/src/reducers/deliverables.js` (~lines 98–102)
    — `setDeliverableProgress` detecting the completion threshold and auto-advancing
    status to `DELIVERED`.
  - `dist/document-models/scope-of-work/gen/schema/types.d.ts` — the progress union
    types and the `Agent { id: PHID }` cross-document reference pattern.

## Suggested shape

Standalone package `@powerhousedao/example-derived-invariants`. Shrink ScopeOfWork to
the minimum that preserves the interesting math:

- Model: `project → milestones[] → deliverables[]`, where a deliverable has
  `{ budget, progress: Binary | Percentage | StoryPoints, status }` and milestones/
  project carry derived `{ totalBudget, progress }`.
- Operations: `addMilestone`, `addDeliverable`, `setDeliverableBudget`,
  `setDeliverableProgress`, `setDeliverableStatus`.
- `invariants.ts` — pure functions: `rollupBudget`, `rollupProgress` (the mixed-mode
  logic), and `applyInvariants(state)` that recomputes bottom-up; every mutating
  reducer ends with it.
- `demo.ts` — build a small project, push progress updates, print the cascade:
  deliverable → milestone → project rollups changing, and the auto `DELIVERED`
  transition firing.
- Tests (the meat): story-points-only sum; mixed-mode averaging (Binary IN_PROGRESS
  counts as 50%); budget rollup after each op; auto-transition exactly at threshold
  and not below; idempotence (`applyInvariants(applyInvariants(s)) === applyInvariants(s)`).

## Implementation notes & pitfalls

- **Invariants must be pure functions of state.** No `Date.now()`, no randomness, no
  reads outside the document — they run on replay on every peer.
- Recompute from first principles (full bottom-up pass) rather than incrementally
  patching — O(n) per op is irrelevant at document scale and eliminates drift bugs.
  State this explicitly; incremental "optimization" is the classic source of stale
  rollups.
- Auto-transitions should be conservative and one-directional (progress dropping back
  below 100% should NOT silently un-deliver — decide, document, test the choice;
  project-management auto-advances only).
- Don't store what you can derive — unless other documents or subgraphs need to query
  it cheaply, which is exactly when a processor read model (`custom-read-model`,
  `relational-db-subgraph`) becomes the right tool. Put this decision table in the
  README.

## Related recipes in this repo

- `role-based-auth` — the other "reducer craft" recipe; same hand-rolled model
  conventions.
- `custom-read-model` / `relational-db-subgraph` — the alternative when derived data
  must be queryable across documents.
