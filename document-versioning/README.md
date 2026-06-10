# Document Versioning

Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure
`upgradeReducer`, so documents created under the old schema keep loading and replaying
correctly.

## What it demonstrates

- The `UpgradeManifest` shape: `{ documentType, latestVersion, supportedVersions, upgrades }`.
- `UpgradeTransition`: `{ toVersion, upgradeReducer, description }` — its `upgradeReducer`
  is a pure function that transforms a whole document from version N−1 to N.
- The versioned document model folder layout: `v1/`, `v2/`, `upgrades/`.
- The upgrade-application logic that `@powerhousedao/reactor` runs in production
  (`computeUpgradePath` + apply + version stamp), distilled into
  [`src/upgrade.ts`](./src/upgrade.ts) — `document-model` only defines the manifest types.
- Replaying an operation log recorded under v1 into a v2 state shape
  ([`src/replay.ts`](./src/replay.ts)).

## State shape evolution

```ts
// v1
type TodoItemV1 = { id: string; title: string; checked: boolean };

// v2 — a field rename plus a type change, the realistic migration case
type TodoItemV2 = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: number;
};
```

The transition in [`document-models/todo/upgrades/v2.ts`](./document-models/todo/upgrades/v2.ts)
maps `checked: true → status: "DONE"`, `checked: false → status: "TODO"`, and adds
`priority: 0`.

## Critical pitfall: patch `state` and `initialState` together

The upgrade runs **once**, when `UPGRADE_DOCUMENT` is dispatched. Replay never re-runs it:
loading a document (`baseLoadFromInput` → `replayDocument`) starts from the stored
`initialState` and folds the domain operations through the latest reducer — the
`document`-scope log where the upgrade is recorded is not replayed.

So if the upgrade reducer migrates `state` but forgets `initialState`:

- the live document looks perfectly healthy, but
- anything seeded into `initialState` (never created by an operation) is still v1-shaped
  there, so a rebuild can no longer reproduce the stored state — and the replayed final
  state fails the recorded hash check. The document errors on load with a
  `HashMismatchError` whose message embeds `Hash mismatch on document …, scope global`
  (match it with `/Hash mismatch/`, as the tests do).

The transition in this recipe patches both in one pass, and
[`tests/versioning.test.ts`](./tests/versioning.test.ts) includes a deliberately broken
state-only transition that makes the failure visible.

## The latest reducer owns the historical log

Replay sends the *entire* operation history through the latest reducer — including
operations whose type no longer exists in the new schema. That is why the v2 reducer keeps
a legacy `CHECK_ITEM` case mapping `checked` onto a `status`. When a migration renames or
retypes fields, retiring an operation from the editor does not retire it from history.

## Upgrade reducers must be pure

Upgrade reducers run on every peer that loads the document. No `Date.now()`, no randomness,
no I/O — and they must *return* a new document (spread-style); there is no immer draft, so
in-place mutation is lost.

## `supportedVersions` is ordered, and every hop must be covered

`supportedVersions` lists every version the model has ever shipped, in ascending order.
Upgrading a v1 document in a package that is already on v3 composes the intermediate
transitions in sequence (v1→v2, then v2→v3) — there is no shortcut path, and a missing
`upgrades` entry for any intermediate hop throws at upgrade time. The `computeUpgradePath`
suite in [`tests/versioning.test.ts`](./tests/versioning.test.ts) exercises both.

## Production wiring

In a full Powerhouse package the pieces in this recipe plug into the platform instead of
`src/upgrade.ts`:

- each version exports a `DocumentModelModule` with an explicit `version: 1` / `version: 2`
  field, and the package exports `documentModels` plus `upgradeManifests` arrays;
- the reactor registers both:
  `new ReactorBuilder().withDocumentModels([TodoV1, TodoV2]).withUpgradeManifests([todoUpgradeManifest])`;
- dispatching `UPGRADE_DOCUMENT` makes the reactor compute the upgrade path from the
  manifest and apply it — the same compose-transitions-then-stamp-version sequence as
  `src/upgrade.ts` here.

A peer that has only the v1 package registered cannot execute the upgrade: the document
stays at v1 there, and v2 operations fail until the updated package ships — deploy the new
model version everywhere before dispatching the first v2 operation.

## Running

```sh
pnpm install
pnpm start
```

The demo creates a v1 document with a seeded item, applies v1 operations, upgrades to v2,
keeps dispatching v2 operations, then replays the recorded history and verifies it
converges on the stored state.

## Tests

```sh
pnpm test
```

Covered: v1/v2 reducer behavior (including the legacy `CHECK_ITEM` case), migration of
`state` and `initialState`, the no-op upgrade of an already-latest document, replay
convergence of the mixed v1/v2 history, the broken state-only transition failing replay
with a hash mismatch, and multi-hop upgrade paths (v1→v2→v3) composing in order.

## License

AGPL-3.0-only
