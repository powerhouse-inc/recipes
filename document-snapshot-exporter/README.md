# Document Snapshot Exporter

CLI tool that exports document state and operation history to JSON files, demonstrating reliable read-after-write consistency using the Reactor API.

## What it demonstrates

- **IReactor API** — low-level interface where mutations return `JobInfo` with consistency tokens
- **Consistency tokens** — passed to reads (`reactor.get()`, `reactor.getOperations()`) to guarantee the read reflects prior writes
- **OperationFilter** — filtering operations by action type, timestamp range, or revision
- **IReactor vs IReactorClient** — run with `--mode reactor` or `--mode client` to compare the two APIs side by side

### IReactor vs IReactorClient

| | IReactor | IReactorClient |
|---|---|---|
| Mutations return | `JobInfo` (must await manually) | The document (job awaited internally) |
| Consistency | You pass `ConsistencyToken` to reads | Managed automatically |
| Signing | Manual (pass `ISigner` to each call) | Automatic via configured signer |
| `getOperations()` returns | `Record<string, PagedResults>` (per-scope) | `PagedResults` (flat) |
| Use when | You need fine-grained control over job lifecycle | You want a simpler, higher-level API |

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
