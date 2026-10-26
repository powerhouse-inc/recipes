# Replay State

`ProcessorRecord.replayState` chooses what `context.resultingState` holds when a processor is replayed. A replay is the first install, a catch-up after a restart, a rerun or a retry. The operation index keeps no resulting state, so the reactor has to supply it, and it can do so four ways.

## How it works

The demo renames one document `Draft`, `Review`, `Final`. It then registers four processors with `startFrom: "beginning"`, one per mode, so each replays the same history. Each `DeliveryRecorder` records the document name found in `resultingState` for every operation it receives.

| `replayState` | What the three renames delivered |
|---------------|----------------------------------|
| `latest` (default) | Three operations, each with `Final`, the document's latest state |
| `collapse` | One delivery for the `SET_NAME` stream, with `Final`; the operations it covers are skipped |
| `exact` | Three operations with `Draft`, `Review`, `Final`, the state at each revision. Slower |
| `operations` | Three operations with no state |

`CREATE_DOCUMENT` and `UPGRADE_DOCUMENT` operations are delivered too and are ignored by the table. Under `collapse` they arrive as their own deliveries, one per scope. After the processors catch up, a fourth rename (`Published`) shows the live case: a live delivery always carries the executor's state, whatever the mode.

## Choosing a mode

- A processor that mirrors the current state of a document (a search index, a snapshot) wants `collapse`. It skips the intermediate operations.
- A processor that reads only the operation (an audit log, a counter) wants `operations`. It avoids the cost of loading state.
- A processor that reads the operation and the state at that point in history wants `exact`.
- `latest` is the default. Its state can be newer than the operation but never older than a state already delivered for that stream.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/recorder.ts` | `DeliveryRecorder`: an `IProcessor` that records the name in each delivery's state |
| `src/scenario.ts` | Builds the reactor, applies the renames, registers one processor per mode |
| `src/demo.ts` | Prints what each mode delivered |
| `tests/replay-state.test.ts` | Asserts the table above |

## Run it

```sh
pnpm start   # demo: prints the deliveries per mode
pnpm test    # vitest against an in-process reactor
```

Needs `@powerhousedao/reactor` 6.2.3-dev.77 or later, the first dev build that has `replayState`, and Node 24 or later.
