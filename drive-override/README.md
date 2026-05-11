# Drive Override

A custom container document that tracks its children via the reactor's `ADD_RELATIONSHIP` system action instead of the `document-drive` model's `ADD_FILE`. The container's own state stays at O(1) regardless of how many children it owns; children live in the reactor's `DocumentRelationship` table and are enumerated through paged, DB-native queries.

## What it demonstrates

- **Build your own drive** — define a minimal `DocumentModelModule` with `name` + `description` state and a single `SET_METADATA` operation. No `nodes[]` array, no embedded child catalogue.
- **`ADD_RELATIONSHIP` instead of `ADD_FILE`** — link 10,000 child documents to the container in batches of 100 via `reactor.execute(containerId, "main", [addRelationshipAction(...)])`. The container's state never grows.
- **Paged enumeration** — read children back via `documentIndexer.getOutgoing(containerId, ["contains"], { cursor, limit })`, advancing `cursor` until `nextCursor` is empty. Backed by indexed Kysely queries on the `DocumentRelationship` table.
- **Bidirectional graph** — `documentIndexer.getIncoming(childId)` returns the container as a parent. The relationship table is indexed on both `sourceId` and `targetId`.

## Why this scales better than `ADD_FILE`

`document-drive` keeps its child catalogue inside the drive document's `state.global.nodes[]`. Each `ADD_FILE` mutates that array — every replay walks every previously-added child, every read materialises the full state, and operation-log size grows with child count. Container performance decays as the drive fills.

`ADD_RELATIONSHIP` is a system-scope action handled directly by the reactor's job executor. The source document's state and operation log are unaffected; the indexer writes one row to `DocumentRelationship` and exposes the graph via `IDocumentIndexer`. Cost is flat in the number of children.

## State shape

```graphql
type CustomContainerState {
  name: String!
  description: String
}
```

That is the entire schema. No children, no nodes, no files.

## Operations

| Operation | Effect |
|---|---|
| `SET_METADATA({ name, description? })` | Sets the container's display metadata. |

Children are added by dispatching `addRelationshipAction(containerId, childId, "contains")` directly to `reactor.execute()` — not through the container's own reducer. The reducer never sees relationships.

## GraphQL

The reactor subgraph exposes the same data over GraphQL:

- `documentOutgoingRelationships(documentId, relationshipTypes, paging)` — children of a container.
- `documentIncomingRelationships(documentId, relationshipTypes, paging)` — parents of a child.

Both fields are paged. Use them when querying from an external client.

## Running

```sh
pnpm install
pnpm --filter @powerhousedao/example-drive-override start
```

The demo will:

1. Spin up an in-memory reactor (PGlite-backed).
2. Create the container and apply `SET_METADATA`.
3. Create 10,000 plain `document-model` child documents in 100 batches of 100, wiring each to the container via `ADD_RELATIONSHIP`.
4. Print the container's `state.global` keys — should remain `["description", "name"]`.
5. Page through all 10,000 children via `documentIndexer.getOutgoing` at 500 per page.
6. Spot-check one child via `documentIndexer.getIncoming` and confirm the container is its parent.

Expect total runtime in the tens of seconds to a few minutes depending on hardware, dominated by the per-job round-trip through the executor. The point is not throughput — it's that the container's state stays flat.

## Key files

- [`src/custom-container.ts`](./src/custom-container.ts) — the minimal `DocumentModelModule`. Self-contained, no `ph generate` step.
- [`src/index.ts`](./src/index.ts) — the demo.
