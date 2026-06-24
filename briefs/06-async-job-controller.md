# Recipe brief: async-job-controller

**One-liner:** A processor as async job executor: when a document's status reaches
`APPROVED`, the processor performs an external side effect (serialized by a mutex,
with retry) and dispatches a completion action **back into the same document** —
advancing its state machine.

## Why this recipe

This "document as job ticket, processor as worker, writeback as acknowledgment" loop
is the backbone of Powerhouse's own cloud product: `vetra-cloud-package`'s processor
watches environment documents and, on `CHANGES_APPROVED`, clones a GitOps repo, writes
Helm values, pushes, and then executes `markChangesPushed` back into the document.
It's distinct from the existing `saga` recipe (which chains operations *across*
documents) — here the interesting part is the external side effect plus single-document
lifecycle writeback, including concurrency control and failure paths.

## What it demonstrates

- A processor that gates on a specific state transition, not on every operation.
- Writeback via `reactorClient.execute(documentId, "main", [action])` — verified
  verbatim in the wild package.
- Convergence: the writeback op re-triggers the processor, which must observe the new
  status and do nothing (the loop terminates by state, not by flags).
- Serializing a non-reentrant side effect with an in-process mutex/queue.
- Retry with recovery, and a distinct failure transition (`markFailed(reason)`).
- Teardown: reacting to drive-level `DELETE_NODE` by cleaning up external resources.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__vetra-cloud-package`** — the production controller.
  - `dist/processors/vetra-cloud-environment/index.js` — verified: gates on
    `CHANGES_APPROVED`; after a successful git sync calls
    `reactorClient.execute(documentId, "main", [action])` with `markChangesPushed`;
    handles drive `DELETE_NODE` (~lines 133–166) by removing the tenant from the
    GitOps repo (external teardown driven by a document deletion).
  - `dist/processors/vetra-cloud-environment/gitops.js` — `GitMutex` class queueing
    concurrent syncs; push retry with `git fetch` + `git rebase` and
    `MAX_PUSH_RETRIES = 3`; `git rebase --abort` on conflict. The
    mutex-plus-retry-with-reconcile structure is exactly what the recipe should distill.
  - `dist/document-models/vetra-cloud-environment/v1/gen/schema/types.d.ts` — the
    11-state lifecycle enum (`DRAFT, CHANGES_PENDING, CHANGES_APPROVED,
    CHANGES_PUSHED, DEPLOYING, READY, STOPPED, TERMINATING, DESTROYED, ARCHIVED, ...`)
    with operations grouped into `packages` / `services` / `data-management` /
    `status-transitions` namespaces.

## Suggested shape

Standalone package `@powerhousedao/example-async-job-controller`.

- "Deployment" document model: `{ name, spec, status: DRAFT | APPROVED | RUNNING |
  SUCCEEDED | FAILED, result?: string }`, operations `approve`, `markRunning`,
  `markSucceeded(result)`, `markFailed(reason)`.
- The external side effect must be deterministic and dependency-free: write a file
  into a temp "deployments" directory, or POST to an in-process mock server that can
  be scripted to fail N times then succeed.
- `mutex.ts` — minimal promise-queue mutex (modeled on `GitMutex`).
- `controller.ts` — processor (or `cross-document-reactor`-style subscription worker)
  that on `status === APPROVED`: dispatch `markRunning` → acquire mutex → run side
  effect with retries → dispatch `markSucceeded`/`markFailed`.
- `demo.ts` — approve three documents concurrently; show serialized execution order,
  one scripted failure-then-retry, and each document's operation history ending in the
  writeback ops.
- Tests: convergence (controller sees its own writeback and stays idle), mutex
  serialization, retry-then-success, failure path.

## Implementation notes & pitfalls

- **Reconcile from state, not from operation deltas.** On restart the controller must
  scan for documents stuck in `APPROVED`/`RUNNING` and resume — vetra-cloud reads
  current document state rather than trusting it saw every op. Demonstrate by
  restarting the controller in the demo.
- Guard re-entrancy by status check (`RUNNING` means another pass is in flight);
  that's what makes the writeback loop terminate.
- Branch name in `execute(documentId, "main", ...)` — use the document's actual
  branch; don't hardcode silently.
- Put a timeout around the side effect; a hung job must end in `markFailed`, not limbo.
- Mention the `saga` recipe's context-threading trick if readers need traceability
  across retries.

## Related recipes in this repo

- `saga` — cross-document chains; this is the single-document external-side-effect
  variant. Position them against each other in the README.
- `cross-document-reactor` — subscription wiring to reuse.
- `batch-progress` — progress reporting if jobs are long.
