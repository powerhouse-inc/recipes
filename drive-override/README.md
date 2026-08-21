# Drive Override

A custom container document that tracks its children via the `ADD_RELATIONSHIP` system action of the reactor (the Powerhouse runtime that stores documents and executes their actions) instead of the `document-drive` model's `ADD_FILE`. The container's own state stays at O(1) regardless of how many children it owns. Children live in the reactor's `DocumentRelationship` table and are enumerated through paged, DB-native queries.

## What it demonstrates

- `reactor.execute(containerId, "main", [addRelationshipAction(...)])` links 10,000 child documents to the container, in batches of 100. The container model keeps no `nodes[]` array.
- Reading children back is a paged call: `documentIndexer.getOutgoing(containerId, ["contains"], { cursor, limit })`, advancing `cursor` until `nextCursor` is empty.
- The graph runs both ways. `documentIndexer.getIncoming(childId)` returns the container as a parent.

## Why `ADD_RELATIONSHIP` scales better than `ADD_FILE`

`document-drive` keeps its child catalogue inside the drive document's `state.global.nodes[]`. Each `ADD_FILE` mutates that array: every replay walks every previously-added child, every read materialises the full state, and operation-log size grows with child count.

`ADD_RELATIONSHIP` is a system-scope action handled directly by the reactor's job executor. The source document's state and operation log are unaffected. The indexer writes one row to `DocumentRelationship` and exposes the graph via `IDocumentIndexer`. Cost is flat in the number of children.

## State shape

```graphql
type CustomContainerState {
  name: String!
  description: String
}
```

That is the entire schema.

## Operations

| Operation | Effect |
|---|---|
| `SET_METADATA({ name, description? })` | Sets the container's display metadata. |

Children are added by dispatching `addRelationshipAction(containerId, childId, "contains")` directly to `reactor.execute()`, not through the container's own reducer.

## GraphQL

The reactor subgraph (the GraphQL schema `@powerhousedao/reactor-api` serves in front of a running reactor) exposes the same data:

- `documentOutgoingRelationships(documentId, relationshipTypes, paging)` returns the children of a container.
- `documentIncomingRelationships(documentId, relationshipTypes, paging)` returns the parents of a child.

Both fields are paged. Use them when querying from an external client. The demo starts no server, so it only prints a note naming both fields.

## Running

```sh
pnpm install
pnpm --filter @powerhousedao/example-drive-override start
```

The demo will:

1. Spin up an in-memory reactor, create the container, and apply `SET_METADATA`. No database to stand up.
2. Create 10,000 plain `document-model` child documents in 100 batches of 100, wiring each to the container via `ADD_RELATIONSHIP`.
3. Print the container's `state.global` keys, which should remain `["description", "name"]`.
4. Page all 10,000 children back at 500 per page, then spot-check one child's parent in reverse.

Expect total runtime in the tens of seconds to a few minutes depending on hardware, dominated by the per-job round-trip through the executor. The demo prints each batch's elapsed time and a total when the loop finishes.

## Key files

- [`document-models/custom-container/`](./document-models/custom-container): the `powerhouse/custom-container` document model. The `SET_METADATA` reducer lives in `v1/src/reducers/metadata.ts`, and everything under `v1/gen/` is codegen output.
- [`src/index.ts`](./src/index.ts): the demo.
