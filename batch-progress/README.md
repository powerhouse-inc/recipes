# Batch Progress

Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch` and real-time progress tracking via the EventBus.

## What it shows

A "Create Project" flow that atomically creates 4 documents with dependencies:

```
budget ──┐
          ├──► project ──► drive (add files)
scope  ──┘
```

- **budget** and **scope** create in parallel (no dependencies)
- **project** waits for both budget and scope
- **drive** adds all three as files after project completes

One call, one result, automatic dependency resolution.

### Without Reactor

```ts
const budget = await createDocument(budgetId, initBudget);
const scope = await createDocument(scopeId, initScope);
// hope nothing interleaves...
const project = await createDocument(projectId, initProject);
await addFilesToDrive(driveId, [budget, scope, project]);
```

Four sequential calls, manual error handling, no atomicity.

### With Reactor

```ts
await reactor.executeBatch({
  jobs: [
    { key: "budget",  documentId: budgetId,  actions: [initBudget],  dependsOn: [] },
    { key: "scope",   documentId: scopeId,   actions: [initScope],   dependsOn: [] },
    { key: "project", documentId: projectId, actions: [initProject], dependsOn: ["budget", "scope"] },
    { key: "drive",   documentId: driveId,   actions: [addFiles],    dependsOn: ["project"] },
  ],
});
```

One call. Budget and scope run in parallel. Project waits for both. Drive waits for project. The reactor handles ordering, parallelism, and failure propagation.

## How it works

1. **Embedded Reactor** — spins up an in-memory Reactor (PGlite, no external DB)
2. **Drive creation** — creates a drive document to hold the project files
3. **Batch submission** — submits 4 dependent jobs via `IReactor.executeBatch`
4. **EventBus tracking** — subscribes to `JOB_PENDING`, `JOB_RUNNING`, `JOB_WRITE_READY`, `JOB_READ_READY`, and `JOB_FAILED` events for real-time status updates
5. **Live progress** — renders a multi-bar terminal display showing each job's status

## Job status lifecycle

```
PENDING → RUNNING → WRITE_READY → READ_READY
                                 ↘ FAILED
```

| Status | Meaning |
|--------|---------|
| `PENDING` | Job is queued but not yet started |
| `RUNNING` | Job is currently being executed |
| `WRITE_READY` | Operations written to the operation store |
| `READ_READY` | Read models have finished indexing (terminal) |
| `FAILED` | Job failed (terminal) |

## Usage

```sh
pnpm install
pnpm start
```

### Example output

```
Multi-Document Wizard — Create Project
═══════════════════════════════════════

Creating drive...
Drive created: abc123

  budget  |████████████████████████████████████████| READ_READY
  scope   |████████████████████████████████████████| READ_READY
  project |████████████████████████████████████████| READ_READY
  drive   |████████████████████████████████████████| READ_READY

✓ Done in 0.42s — 4 jobs completed, 0 failed
  Budget:  def456
  Scope:   ghi789
  Project: jkl012
  Drive:   abc123
```

## License

AGPL-3.0-only
