# Positional Delete

Deletion as a **position in the merged operation order**, not a document-wide
tombstone. A `deleteDocument` refuses only the operations that sort after it.
Operations that sort before it are legitimate history, even when they arrive later
over sync. Refusal stores the operation as a **denied operation** rather than dropping
it, so every reactor can independently reach the same verdict for the same history.

The demo is a plain split-brain with a custom `field-log` document model: Station B
keeps logging observations while Station A deletes the document. No backdating, no
clock tricks. B's second observation genuinely happens after the delete in wall-clock
time, B just doesn't know yet.

## What it demonstrates

- After syncing both directions, both reactors agree per operation: the observation
  that sorts before the delete is applied, the one after it is denied.
- The refused operation keeps its place in the stored stream, with `deniedReason:
  "document deleted"` recorded on it. Inspect it with `isDenied(operation)` and
  `garbageCollect(sortOperations(...))` from `@powerhousedao/shared/document-model`.
- No origin verdict is shipped or trusted. Each reactor judges arriving history at
  its own position in the merged order, which is what lets the two converge without
  coordinating. The `judges each operation at its position and converges` case asserts
  the same verdict list on both.
- Once a reactor knows the delete, a newly submitted write fails its job outright
  (`DocumentDeletedError`) and nothing is stored.
- A single-document read serves the state as of the deletion boundary instead of a
  hole (see the scope note below).
- Without the decision model there is a cliff: one deleted flag rejects a whole
  incoming load, discarding even the history that sorts before the delete.

## Running

```sh
pnpm install
pnpm start   # runs src/demo.ts
```

```text
[Station B] log "temp 18 °C" → ok
[Station A] deleteDocument → ok (B doesn't know yet)
[Station B] log "humidity 80 %" → ok

=== effective operations on Station A ===
  "wind 12 kn" → applied
  "temp 18 °C" → applied
  "humidity 80 %" → DENIED (document deleted)
=== effective operations on Station B ===   (identical)
```

## How it works

The reactor is built with the `documentDecisions` feature flag, which replaces the
cached whole-document `isDeleted` check with a decision model built over the
document stream:

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([FieldLog, documentModelDocumentModelModule])
  .withExecutorConfig({ featureFlags: { documentDecisions: true } })
  .build();
```

Admission is the write path's decision at the stream heads: `decideAtHead` in
`@powerhousedao/reactor` compiles an append condition over everything it read, and the
store enforces that condition at write time. A load instead evaluates each operation
at its own position. A delete arriving late triggers re-evaluation of the tail it now
precedes, which re-appends retracted operations with a skip rather than rewriting
history. The stored rows therefore keep both copies, and
`garbageCollect(sortOperations(...))` resolves them to the effective stream that
`src/demo.ts` prints.

## Scope note: views on the retraction path

The "state as of the deletion" read is a **load-path** guarantee: on the reactor that
received the denied operation via sync, it was never applied, and `reactor.get()`
serves history up to the boundary. A reactor that had **already applied** an
operation before learning of the delete keeps its materialized view. The retraction
still lands in the effective operation stream, which is the consensus artifact, so
any rebuild or replay from it sees the boundary state. Both sides are covered in
`tests/positional-delete.test.ts`.

## State shape

```graphql
type FieldLogState {
  observations: [Observation!]!
}

type Observation {
  id: ID!
  note: String!
  recordedBy: String!
}
```

One operation, `LOG_OBSERVATION`. The reducer's only invariant is id uniqueness.
Deletion never touches model code: `DELETE_DOCUMENT` is a platform action on the
`document` scope, and all of the semantics above live in the platform.

## Tests

```sh
pnpm test
```

`tests/positional-delete.test.ts` runs the same split-brain against two reactors and
covers the behavior above in five cases.

## Regenerating

The document-model spec lives in `document-models/field-log/field-log.json`:

```sh
pnpm run generate
```

## Related recipes

- [`document-acl`](../document-acl): the auth scope rides the same decision-model
  machinery. Authorization verdicts are also computed per operation at its position.
- [`document-versioning`](../document-versioning): replaying stored history is what
  makes "the effective stream is the consensus artifact" matter.

## License

AGPL-3.0-only
