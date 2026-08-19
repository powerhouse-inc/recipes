# Document Snapshot Exporter

CLI tool that exports document state and operation history to JSON files, demonstrating reliable read-after-write consistency using the Reactor API.

## What it demonstrates

`IReactor` is the low-level interface: every mutation returns a `JobInfo` rather than the
document. `exportWithReactor` awaits the job with `JobAwaiter` and takes the
`consistencyToken` off the completed job. Passing that token to `reactor.get()` and
`reactor.getOperations()` guarantees the read reflects the write, even while background
indexing is still catching up.

`OperationFilter` narrows what comes back, by action type (`actionTypes`), timestamp range
(`timestampFrom`, `timestampTo`), or revision (`sinceRevision`). The exporter passes an empty
filter in `src/export-reactor.ts`.

### IReactor vs IReactorClient

| | IReactor | IReactorClient |
|---|---|---|
| Mutations return | `JobInfo` (must await manually) | The document (job awaited internally) |
| Consistency | You pass `ConsistencyToken` to reads | Managed automatically |
| Signing | Manual (mutations like `create()` take an optional `ISigner`) | Automatic, from `ReactorClientBuilder.withSigner()` |
| `getOperations()` returns | `Record<string, PagedResults>` keyed by scope | `PagedResults` (flat) |
| Use when | You need fine-grained control over job lifecycle | You want a simpler, higher-level API |

`ISigner` is the action-signing interface exported by `@powerhousedao/shared/document-model`.
A scope is one named slice of a document's state. `reactor.getOperations()` keys its result
by scope name (`global` and `document` in these exports), and `exportWithReactor` flattens
that map into one array, tagging each operation with its `scope`.

## Usage

```sh
pnpm install
pnpm start
```

### Options

```
--mode <reactor|client>   API mode (default: reactor)
--out <path>              Output directory (default: ./output)
```

### Examples

```sh
# Export using low-level IReactor with explicit consistency tokens
pnpm start

# Export using high-level IReactorClient
pnpm start -- --mode client

# Custom output directory
pnpm start -- --out ./snapshots

# Compare both modes
pnpm start -- --out ./out-reactor
pnpm start -- --mode client --out ./out-client
```

## Output

Each document is written as a JSON file named `<document-id>.json`:

```json
{
  "header": { "id": "...", "documentType": "...", ... },
  "state": { ... },
  "operations": [ ... ],
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "mode": "reactor"
}
```
