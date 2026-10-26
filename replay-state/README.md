# Replay State

`ProcessorRecord.replayState` chooses what `context.resultingState` holds when a processor is replayed. A replay is the first install, a catch-up after a restart, a rerun or a retry. The operation index keeps no resulting state, so the reactor has to supply it, and it can do so four ways.

## How it works

The demo renames one document `Draft`, `Review`, `Final`. It then registers four processors with `startFrom: "beginning"`, one per mode, so each replays the same history. Each `DeliveryRecorder` records the scope, the action type and the document name found in `resultingState` for every operation it receives.

| `replayState` | What the three renames delivered |
|---------------|----------------------------------|
| `latest` (default) | Three operations, each with `Final`, the document's latest state |
| `collapse` | One delivery, the last rename, with `Final`; the two before it are skipped |
| `exact` | Three operations with `Draft`, `Review`, `Final`, the state at each revision. Slower |
| `operations` | Three operations with no state |

A replay stream is one document, scope and branch. The renames are in the `global` scope. `CREATE_DOCUMENT` and `UPGRADE_DOCUMENT` are in the `document` scope, a second stream, and the table leaves them out. `collapse` cuts that stream to its last operation too, so it arrives as `UPGRADE_DOCUMENT` alone.

After the processors catch up, a fourth rename (`Published`) shows the live case. All four modes receive it with the executor's state: `replayState` applies only to replays.

## Choosing a mode

- A processor that mirrors the current state of a document (a search index, a snapshot) wants `collapse`. It skips the intermediate operations.
- A processor that reads only the operation (an audit log, a counter) wants `operations`. It avoids the cost of loading state.
- A processor that reads the operation and the state at that point in history wants `exact`.
- `latest` is the default. Its state can be newer than the operation but never older than a state already delivered for that stream.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/recorder.ts` | `DeliveryRecorder`: an `IProcessor` that records the scope, action type and state name of each delivery |
| `src/scenario.ts` | Builds the reactor, applies the renames, registers one processor per mode, applies the live rename |
| `src/demo.ts` | Prints what each mode delivered |
| `tests/replay-state.test.ts` | Asserts the table above and the live delivery for each mode |

## Run it

```sh
pnpm start   # demo: prints the deliveries per mode
pnpm test    # vitest against an in-process reactor
```

## Requirements

| Requirement | Why |
|-------------|-----|
| `@powerhousedao/reactor` and `@powerhousedao/shared` 6.2.3-dev.75 or a later dev build | 6.2.3-dev.75 is the first build with `replayState`. The catalog pins 6.2.3-dev.77. The 6.2.3 release does not have it |
| Node 24 or later | The published reactor calls `Error.isError`, which Node 22 does not have. On Node 22 the demo fails with `TypeError: Error.isError is not a function` |
