# Recipe brief: document-versioning

**One-liner:** Evolve a document model's schema from v1 to v2 using an `UpgradeManifest`
with a pure `upgradeReducer`, so documents created under the old schema keep loading and
replaying correctly.

## Why this recipe

Every long-lived document model eventually needs a schema change, and nothing in this
repo covers it. The platform ships a dedicated versioning layer (`UpgradeManifest`,
`UpgradeTransition`) and Powerhouse published an entire example package
(`@powerhousedao/versioned-documents`) just to demonstrate it — strong signal that
builders need a distilled, runnable reference. This recipe should strip the pattern down
to its mechanics without the `ph-cli` scaffolding noise.

## What it demonstrates

- `UpgradeManifest` shape: `{ documentType, latestVersion, supportedVersions, upgrades }`.
- `UpgradeTransition`: `{ toVersion, upgradeReducer, description }` — a pure function
  transforming the document from version N-1 to N.
- Replaying an operation log recorded under v1 into a v2 state shape.
- Versioned document model folder layout (`v1/`, `v2/`, `upgrades/`).

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__versioned-documents`** — the canonical example (a Todo model with
  v1 + v2).
  - `dist/upgrade-manifest-BdBusF1T.js` — the real manifest object. Note the v2
    `upgradeReducer` patches **both** `state` and `initialState` in one pass (verified:
    `supportedVersions = [1, ...]`, `upgradeReducer`).
  - `dist/document-models/todo/index.d.ts` — generated hook surface
    (`useTodoDocumentById`, `useSelectedTodoDocument`, etc.) co-located with the model.
  - `package.json` — the scaffold path: `"tsx scripts/create-versioned-todo.ts &&
    ph-cli generate ./scripts/versioned-todo.zip --use-versioning"` shows how codegen
    enables the versioning layer.
- **`qa-test-16`** — `dist/types/document-models/habit-tracker/upgrades/upgrade-manifest.d.ts`
  — the scaffolded-but-empty shape (`supportedVersions: readonly [1]`, `upgrades: {}`),
  useful to see what codegen emits before any migration exists.
- **`Retrospective-toolkit`** — `dist/document-models/retrospective/upgrades/upgrade-manifest.d.ts`
  — same pattern on a more complex model.

## Suggested shape

Standalone package `@powerhousedao/example-document-versioning` following repo
conventions (catalog deps, `demo.ts`, vitest).

- A small todo model defined by hand (as `role-based-auth` does — no codegen needed):
  - **v1 state:** `{ items: { id, title, checked: boolean }[] }`
  - **v2 state:** `{ items: { id, title, status: 'TODO'|'IN_PROGRESS'|'DONE', priority: number }[] }`
    — a field rename + type change, the realistic migration case.
- `upgrades.ts` exporting the manifest with one `UpgradeTransition` mapping
  `checked: true → status: 'DONE'`, `checked: false → status: 'TODO'`, `priority: 0`.
- `demo.ts`: create a v1 document, apply several v1 operations, run the upgrade, keep
  dispatching v2 operations, print the final state and operation history.
- Tests: v1 log replays to correct v2 state; `initialState` and `state` stay consistent;
  upgrading an already-latest document is a no-op.

## Implementation notes & pitfalls

- **Patch `state` and `initialState` together.** The versioned-documents upgrade reducer
  mutates both in a single pass — if they diverge, replaying the migrated log from
  `initialState` produces a different document than the stored `state`. This is the
  correctness subtlety that justifies the recipe; call it out loudly in the README.
- Upgrade reducers must be pure and deterministic (no `Date.now()`, no I/O) — they run
  during replay on every peer.
- `supportedVersions` is ordered; the manifest must cover every hop (v1→v2→v3), and
  upgrades compose sequentially.
- Show what happens to a peer that doesn't have the v2 model registered (graceful
  failure is worth a sentence in the README even if not demonstrated).

## Related recipes in this repo

- `role-based-auth` — precedent for a hand-rolled custom document model.
- `drive-override` — precedent for shipping a custom document type in a recipe.
