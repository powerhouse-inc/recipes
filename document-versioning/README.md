# Document Versioning

Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure
`upgradeReducer`, so documents created under the old schema keep loading and replaying
correctly.

## What it demonstrates

- Defining two schema versions in a single codegen spec:
  [`document-models/todo/todo.json`](./document-models/todo/todo.json) carries one
  `specifications` entry per version, and `ph-cli generate` emits the whole `v1/`, `v2/`,
  and `upgrades/` tree — including a wired-up `UpgradeManifest`
  (`{ documentType, latestVersion, supportedVersions, upgrades }`) and a stub upgrade
  transition for you to fill in.
- `UpgradeTransition`: `{ toVersion, upgradeReducer, description }` — its `upgradeReducer`
  is a pure function that transforms a whole document from version N−1 to N. Codegen
  scaffolds the stub at
  [`document-models/todo/upgrades/v2.ts`](./document-models/todo/upgrades/v2.ts); the
  migration body is the one piece you hand-write.
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

Each version's shape is declared as GraphQL in the matching `specifications` entry of
[`todo.json`](./document-models/todo/todo.json); codegen turns it into the types above. The
transition in [`document-models/todo/upgrades/v2.ts`](./document-models/todo/upgrades/v2.ts)
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
operations whose type no longer exists in the new schema. That is why `CHECK_ITEM` is
retained as an operation in the v2 spec (so codegen keeps generating its action and reducer
slot), and [`v2/src/reducers/todo.ts`](./document-models/todo/v2/src/reducers/todo.ts) maps
the old `checked` boolean onto the new `status`. When a migration renames or retypes fields,
retiring an operation from the editor does not retire it from history.

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

Codegen already emits the structure a real package registers: each version's
[`module.ts`](./document-models/todo/v2/module.ts) carries an explicit `version` field,
[`document-models/document-models.ts`](./document-models/document-models.ts) exports
`documentModels = [TodoV1, TodoV2]`, and
[`document-models/upgrade-manifests.ts`](./document-models/upgrade-manifests.ts) exports
`upgradeManifests = [todoUpgradeManifest]`. The only thing this recipe does differently from
production is *who applies the upgrade*:

- a reactor registers both
  (`new ReactorBuilder().withDocumentModels(documentModels).withUpgradeManifests(upgradeManifests)`)
  and, on `UPGRADE_DOCUMENT`, computes the upgrade path from the manifest and applies it;
- here, [`src/upgrade.ts`](./src/upgrade.ts) runs that same
  compose-transitions-then-stamp-version sequence in-process, so the mechanics are visible
  without standing up a reactor.

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

## Regenerating the model

The `document-models/` tree is generated from
[`document-models/todo/todo.json`](./document-models/todo/todo.json) and committed to the
repo. To evolve a schema, edit the spec (add a `specifications` entry for the new version)
and re-run codegen:

```sh
pnpm generate
```

`gen/` files are overwritten on every run; the hand-written reducers
(`*/src/reducers/todo.ts`) and the upgrade transitions (`upgrades/v*.ts`) are scaffolded
once and then preserved, so re-running is safe.

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
