# Custom Read Model

A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view. Demonstrates the read model lifecycle, the pre-ready guarantee, and how read models differ from processors.

## How it works

`DocumentCountReadModel` implements `IReadModel` directly — it receives every operation written to the reactor's operation store via `indexOperations()` and increments an in-memory counter keyed by `context.documentType`.

```
Operation written → JOB_WRITE_READY → ReadModelCoordinator
                                        ├── preReady:  DocumentCountReadModel.indexOperations() ← our read model
                                        ├── preReady:  DocumentView, DocumentIndexer (built-in)
                                        ├── emit JOB_READ_READY  ← counts are already up to date here
                                        └── postReady: processors, subscriptions
```

### Read model vs processor

| | Read Model (IReadModel) | Processor (IProcessor) |
|--|--|--|
| Phase | **Pre-ready** — completes before `JOB_READ_READY` | **Post-ready** — runs after `JOB_READ_READY` |
| Purpose | Derived views that must be queryable immediately | Side-effects (webhooks, notifications, sync) |
| Registration | `ReactorBuilder.withReadModel()` | `ProcessorManager.registerFactory()` |
| Receives | `OperationWithContext[]` via `indexOperations()` | `OperationWithContext[]` via `onOperations()` |

### Why implement IReadModel directly?

`BaseReadModel` provides catch-up/rewind via the `ViewState` table and requires `IOperationIndex`, `IWriteCache`, and `IConsistencyTracker` — useful for persistent read models but unnecessary for a simple in-memory counter. Implementing `IReadModel` directly keeps the example minimal and shows the core contract.

### buildModule() internals

`ReactorBuilder.buildModule()` returns a `ReactorModule` with direct access to the event bus, database, operation store, and other internals — useful for advanced integration, testing, or custom wiring.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/document-count-read-model.ts` | `DocumentCountReadModel` — the `IReadModel` implementation |
| `src/index.ts` | Demo: builds a reactor, creates a document, shows the read model counts inside `JOB_READ_READY` |

## Usage

### Run the demo

```sh
pnpm start
```

### Use in your own code

```ts
import { ReactorBuilder } from "@powerhousedao/reactor";
import { DocumentCountReadModel } from "./src/document-count-read-model.js";

const countReadModel = new DocumentCountReadModel();

const reactorModule = await new ReactorBuilder()
  .withDocumentModels([/* your models */])
  .withReadModel(countReadModel)
  .buildModule();

// After any job completes, counts are already up to date:
reactorModule.eventBus.subscribe(
  ReactorEventTypes.JOB_READ_READY,
  () => {
    console.log(countReadModel.getCounts());
  },
);
```

### Query the materialized view

```ts
// All counts
const counts: ReadonlyMap<string, number> = countReadModel.getCounts();

// Single type
const budgetOps = countReadModel.getCount("powerhouse/budget");
```

## Tests

```sh
pnpm test
```

## Exports

```ts
export { DocumentCountReadModel } from "./src/document-count-read-model.js";
```
