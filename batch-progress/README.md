# Batch Progress

Demonstrates multi-document wizard creation with dependency ordering using Reactor's `executeBatch`, with per-job progress tracked through the EventBus, the reactor module's job-event stream.

## What it shows

A "Create Project" flow that creates 4 documents in one `executeBatch` call, in dependency order:

```
budget ──┐
          ├──► project ──► drive (add files)
scope  ──┘
```

Budget and scope have no dependencies, so they create in parallel. Project waits for both, and drive adds all three as files once project completes.

### Without Reactor

```ts
const budget = await createDocument(budgetId, initBudget);
const scope = await createDocument(scopeId, initScope);
// hope nothing interleaves...
const project = await createDocument(projectId, initProject);
await addFilesToDrive(driveId, [budget, scope, project]);
```

Four sequential calls, manual error handling, and nothing keeping other writes from interleaving.

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

One call. `executeBatch` sorts the jobs topologically and turns each `dependsOn` key into a `queueHint`, so a job dequeues only once the jobs it names have resolved. There is no rollback: a job that fails ends at `FAILED`, and whatever earlier jobs wrote stays written.

## How it works

1. Spins up an in-memory Reactor with `ReactorBuilder`: PGlite, an in-process Postgres, no external DB.
2. Creates a drive document to hold the project files.
3. Submits the 4 jobs built by `buildCreateProjectBatch` via `IReactor.executeBatch`.
4. Subscribes on the EventBus to `JOB_PENDING`, `JOB_RUNNING`, `JOB_WRITE_READY`, `JOB_READ_READY`, and `JOB_FAILED` for status updates.
5. Renders a multi-bar terminal display showing each job's status. Recorded events replay with a short delay, since they fire while `executeBatch` runs.

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
