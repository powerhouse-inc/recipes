# Custom Read Model

A custom `IReadModel` implementation registered via `ReactorBuilder.withReadModel()` that maintains a document-count-per-type materialized view. Demonstrates the read model lifecycle, the pre-ready guarantee (counts are current before `JOB_READ_READY` fires), and how read models differ from processors.

## How it works

`DocumentCountReadModel` implements `IReadModel` directly. It receives every operation written to the reactor's operation store via `indexOperations()` and increments an in-memory counter keyed by `context.documentType`.

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
| Phase | **Pre-ready**: completes before `JOB_READ_READY` | **Post-ready**: runs after `JOB_READ_READY` |
| Purpose | Derived views that must be queryable immediately | Side-effects (webhooks, notifications, sync) |
| Registration | `ReactorBuilder.withReadModel()` | `ProcessorManager.registerFactory()` |
| Receives | `OperationWithContext[]` via `indexOperations()` | `OperationWithContext[]` via `onOperations()` |

### Why implement IReadModel directly?

`BaseReadModel` tracks its progress in the `ViewState` table so it can catch up or rewind, and its constructor takes a database handle plus three reactor internals: `IOperationIndex`, `IWriteCache`, and `IConsistencyTracker`. Those are constructed inside `buildModule()`, so a subclass registers through `withReadModelFactory()` rather than `withReadModel()`. The `ViewState` tracking and those dependencies serve persistence, which an in-memory counter does not need. `IReadModel` itself requires only `name` and `indexOperations()`.

### buildModule() internals

`ReactorBuilder.buildModule()` returns an `InProcessReactorModule`: the event bus, database, operation store, and the rest of the reactor's dependency graph. `src/index.ts` destructures `eventBus` from it and subscribes to `JOB_READ_READY` directly.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/document-count-read-model.ts` | `DocumentCountReadModel`: `indexOperations()` writes the counter, `getCounts()` and `getCount()` read it |
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
  .withDocumentModelSources([/* your models */])
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
