# Document Snapshot Exporter

CLI tool that exports document state and operation history to JSON files, demonstrating read-after-write consistency using the Reactor API.

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
| Signing | Manual: `create()` takes an `ISigner`, and `execute()` takes actions signed with `ISigner.signAction(action, { documentId, branch })` | Automatic, from `ReactorClientBuilder.withSigner()` |
| `getOperations()` returns | `Record<string, PagedResults>` keyed by scope | `PagedResults` (flat) |
| Use when | You need fine-grained control over job lifecycle | You do not need access to `JobInfo` or consistency tokens |

`ISigner` is the action-signing interface exported by `@powerhousedao/shared/document-model`.
Both modes sign with the same `RenownCryptoSigner` key, because a reactor that verifies
signatures refuses an unsigned write. `sign()` in `src/export-reactor.ts` attaches the
tuple to the action as `context.signer`.
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
