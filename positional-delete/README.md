# Positional Delete

Deletion as a **position in the merged operation order**, not a document-wide
tombstone. A `deleteDocument` refuses only the operations that sort after it;
operations that sort before it are legitimate history — even when they arrive later
over sync. Refused operations are stored as **denied operations** (`deniedReason:
"document deleted"`) rather than silently dropped, so every reactor can independently
reach the same verdict for the same history.

The demo is a plain split-brain with a custom `field-log` document model: Station B
keeps logging observations while Station A deletes the document. No backdating, no
clock tricks — B's second observation genuinely happens after the delete in wall-clock
time, B just doesn't know yet.

## What it demonstrates

- **Per-operation verdicts** — after syncing both directions, both reactors agree:
  the observation that sorts before the delete is applied, the one after it is denied.
- **Denied, not dropped** — the refused operation keeps its place in the stored
  stream with `deniedReason` set; inspect with `isDenied(operation)` and
  `garbageCollect(sortOperations(...))` from `@powerhousedao/shared/document-model`.
- **Convergence without coordination** — each reactor judges arriving history at its
  position in the merged order; no origin verdict is shipped or trusted.
- **Origin refusal** — once a reactor knows the delete, a newly submitted write fails
  its job outright (`DocumentDeletedError`); nothing is stored.
- **Reading a deleted document** — a single-document read serves the state as of the
  deletion boundary instead of a hole (see the scope note below).
- **The legacy cliff** — without the decision model, one deleted flag rejects a whole
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
meta-cache `isDeleted` check with a decision model built over the document stream:

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([FieldLog, documentModelDocumentModelModule])
  .withExecutorConfig({ featureFlags: { documentDecisions: true } })
  .build();
```

Admission decides at the head and appends under a condition on the streams it read
(the DCB mechanic); a load evaluates each operation at its own position; a delete
arriving late triggers re-evaluation of the tail it now precedes, which re-appends
retracted operations with a skip rather than rewriting history. The stored rows keep
both copies — `garbageCollect(sortOperations(...))` resolves to the effective stream.

## Scope note: views on the retraction path

The "state as of the deletion" read is a **load-path** guarantee: on the reactor that
received the denied operation via sync, it was never applied, and `reactor.get()`
serves history up to the boundary. A reactor that had **already applied** an
operation before learning of the delete keeps its materialized view; the retraction
lands in the effective operation stream, which is the consensus artifact — any
rebuild or replay from it sees the boundary state. The test suite pins down both
sides of this.

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

One operation, `LOG_OBSERVATION` — the reducer's only invariant is id uniqueness.
Deletion never touches model code: `DELETE_DOCUMENT` is a platform action on the
`document` scope, and all of the semantics above live in the platform.

## Tests

```sh
pnpm test
```

`tests/positional-delete.test.ts` covers: convergent per-position verdicts on both
reactors, the refused operation being stored rather than dropped, the boundary-state
read on the load path, origin failure once the delete is known, and the legacy
whole-load rejection with the decision model off.

## Regenerating

The document-model spec lives in `document-models/field-log/field-log.json`:

```sh
pnpm run generate
```

## Related recipes

- [`document-acl`](../document-acl) — the auth scope rides the same decision-model
  machinery: authorization verdicts are also computed per operation at its position.
- [`document-versioning`](../document-versioning) — replaying stored history is what
  makes "the effective stream is the consensus artifact" matter.

## License

AGPL-3.0-only
