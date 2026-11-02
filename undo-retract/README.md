# Undo by RETRACT

On a base-reducer 3 document an undo is not a reducer-level `UNDO` that moves operations to a clipboard. It is a `RETRACT { target }` operation that names the undone action by its id and is signed by its author. A redo is a `RETRACT` of that retraction. Replicas that hold the same operations derive the same state whatever order they received them in. Documents at base-reducer 1 and 2 keep `UNDO` and `REDO`.

## How it works

The demo adds two modules to a `powerhouse/document-model` document, then calls `client.undo`, `client.redo` and `client.undo` again. After each step it records the document's modules, `undoRedoAvailability` and `undoRedoTargets`.

```
added modules "a" and "b"  modules: [a, b]  canUndo: true  canRedo: false
undo                       modules: [a]     canUndo: true  canRedo: true
redo                       modules: [a, b]  canUndo: true  canRedo: false
undo                       modules: [a]     canUndo: true  canRedo: true
```

The `global` stream at the end holds the two edits and three `RETRACT` operations. Nothing in it is an `UNDO` or `REDO`:

| Index | Operation | `input` |
|-------|-----------|---------|
| 0, 1 | `ADD_MODULE` | the edits |
| 2 | `RETRACT` | `{ target: <id of edit 1> }` (the first undo) |
| 3 | `RETRACT` | `{ target: <id of operation 2> }` (the redo) |
| 4 | `RETRACT` | `{ target: <id of edit 1> }` (the second undo) |

`client.undoRedoTargets(id)` returns the action ids the next undo (`undoTarget`) or redo (`redoTarget`) would retract. `client.undoRedoAvailability(id)` returns `{ canUndo, canRedo }`. Both read the operation log, and both are empty for a scope the caller may not read.

## Gotchas

- **Create the document from the reactor's flags.** `client.write.createEmpty(type)` builds the header from the reactor's feature flags, so the document is base-reducer 3. A document built by hand with `documentModelCreateDocument()` carries its own header and stays at base-reducer 2, where `client.redo` submits a `REDO` that fails with `Cannot redo: no operations in the clipboard`.
- **Not every action is undoable.** `SET_NAME` edits the header and has no undo target; `undoRedoTargets` is empty after it, and `client.undo` throws `Cannot undo: nothing to undo in scope history`. The demo uses `ADD_MODULE`.
- **The `auth` and `document` scopes resolve no target.** Undo applies to content scopes such as `global`.
- **A race is refused, not retried.** The `RETRACT` names the row the call saw as latest. If that row is retracted or gone by the time the job runs, the job fails with `RetractionRefusedError`.

## Running

```bash
pnpm install   # at the repo root
pnpm start     # prints the table above
pnpm test      # vitest against an in-process reactor
```

## Requirements

| Requirement | Why |
|-------------|-----|
| `@powerhousedao/reactor` and `@powerhousedao/shared` 6.2.3-dev.90 or a later dev build | The first published build with `write.undo`, `write.redo`, `undoRedoTargets` and `undoRedoAvailability`. The catalog pins 6.2.3-dev.90. The 6.2.3 release does not have them |
| `undoV3` on | dev.90 predates the change that turns it on by default (powerhouse#3348), so the recipe sets `featureFlags: { undoV3: true }` on the `ReactorBuilder`. Once the default is on the line is redundant, and `undoV3: false` makes new documents base-reducer 2 again |
| Node 24 or later | The published reactor calls `Error.isError`, which Node 22 does not have |

## Architecture

| Module | Purpose |
|--------|---------|
| `src/scenario.ts` | Builds the client and reactor, runs the edits, undo and redo, and returns the steps and the stream |
| `src/demo.ts` | Prints the steps and the stream |
| `tests/undo-retract.test.ts` | Asserts the base-reducer, the `RETRACT` targets, the signer and the derived state |
