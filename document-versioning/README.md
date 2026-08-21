# Document Versioning

Evolve a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure
`upgradeReducer`, so documents created under the old schema keep loading and replaying
correctly.

## What it demonstrates

[`document-models/todo/todo.json`](./document-models/todo/todo.json) carries one
`specifications` entry per version, and `pnpm generate` (the Powerhouse CLI's
`ph-cli generate`) emits the whole `v1/`, `v2/`, and `upgrades/` tree. That tree includes a
wired-up `UpgradeManifest` (`{ documentType, latestVersion, supportedVersions, upgrades }`)
and a stub `UpgradeTransition` (`{ toVersion, upgradeReducer, description }`) at
[`upgrades/v2.ts`](./document-models/todo/upgrades/v2.ts). The migration body is the one
piece you hand-write.

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

The transition in
[`document-models/todo/upgrades/v2.ts`](./document-models/todo/upgrades/v2.ts)
maps `checked: true → status: "DONE"`, `checked: false → status: "TODO"`, and adds
`priority: 0`.

## Critical pitfall: patch `state` and `initialState` together

The upgrade runs **once**, when `UPGRADE_DOCUMENT` is dispatched. Replay never re-runs it:
loading a document (`baseLoadFromInput` → `replayDocument`, distilled in
[`src/replay.ts`](./src/replay.ts)) starts from the stored `initialState` and folds the
`global` scope's domain operations through the latest reducer. `CREATE_DOCUMENT` and the
upgrade record live in the `document` scope, which replay skips.

A transition that migrates `state` but forgets `initialState` leaves a healthy-looking
document whose seeded items, created by no operation, stay v1-shaped in `initialState`.
A rebuild no longer reproduces the stored state, and the document errors on load with a
`HashMismatchError` (`Hash mismatch on document …, scope global`). The transition here
patches both, and [`tests/versioning.test.ts`](./tests/versioning.test.ts) includes a
deliberately broken state-only one.

## The latest reducer owns the historical log

Replay sends the *entire* operation history through the latest reducer, including
operation types the new schema no longer defines. That is why the v2 spec retains
`CHECK_ITEM` and [`v2/src/reducers/todo.ts`](./document-models/todo/v2/src/reducers/todo.ts)
maps the old `checked` boolean onto the new `status`.

## Upgrade reducers must be pure

Upgrade reducers run on every peer that loads the document. No `Date.now()`, no randomness,
no I/O. They must also *return* a new document: there is no immer draft, so in-place
mutation is lost.

## `supportedVersions` is ordered, and every hop must be covered

`supportedVersions` lists every shipped version in ascending order, and
`computeUpgradePath` composes one transition per hop: a v1 document in a package on v3 goes
v1→v2 then v2→v3, and a missing `upgrades` entry throws.

## Production wiring

Codegen already emits the structure a real package registers: a `version` field on each
version's [`module.ts`](./document-models/todo/v2/module.ts),
`documentModels = [TodoV1, TodoV2]` in
[`document-models/document-models.ts`](./document-models/document-models.ts), and
`upgradeManifests = [todoUpgradeManifest]` in
[`document-models/upgrade-manifests.ts`](./document-models/upgrade-manifests.ts). A reactor
registers both
(`new ReactorBuilder().withDocumentModelSources(documentModels).withUpgradeManifests(upgradeManifests)`)
and applies the path on `UPGRADE_DOCUMENT`. Here [`src/upgrade.ts`](./src/upgrade.ts) runs
that same compose-transitions-then-stamp-version sequence in-process.

## Creating a document at its model version

A v1 document must declare version 1: the manifest covers 1→2 and has no transition *into*
v1, so a document left at version 0 gives `computeUpgradePath` nowhere to start
(`Version 0 ... is not in supportedVersions [1, 2]`). The generated factory stamps it, and
initial items are seeded through `global`:

```ts
import { createTodoDocument } from "document-models/todo/v1";

createTodoDocument({ document: { version: 1 }, global: { items } });
```

## Running

```sh
pnpm install
pnpm start
```

The demo creates a v1 document with a seeded item, upgrades it, dispatches v2 operations,
then replays the history and verifies the replay matches the live document.

## Tests

```sh
pnpm test
```
