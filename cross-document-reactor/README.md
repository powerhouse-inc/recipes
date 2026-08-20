# Cross-Document Reactor

Event-driven cross-document automation using `ReactorClient` subscriptions.

## What it demonstrates

A subscription callback can write. The handler passed to `reactorClient.subscribe()` acts on a document other than the one that changed: it calls the same client's `find()` and `rename()` in `src/index.ts`. The rule lives in that callback rather than in a processor, and [saga](../saga) shows the processor version of the same pattern.

## How it works

1. Creates a drive, the container document the others live under, holding an **invoice** and a **task** linked by naming convention (`Invoice-001` ↔ `Task-001-Invoice-001`)
2. Subscribes to all document changes with an empty search filter (`{}`)
3. When the invoice is renamed to include `[PAID]`, the subscription handler finds the related task and renames it to include `[CLOSED]`
4. The handler ignores every event type except `DocumentChangeType.Updated`, and a `reacting` flag keeps it from re-entering while its own rename is in flight

## Running

```sh
pnpm install
pnpm --filter @powerhousedao/cross-document-reactor start
```

## Expected output

```
Cross-Document Reactor
══════════════════════

Starting reactor... done (X.Xs)

Creating drive... <drive-id>
Creating invoice document... <invoice-id>
Creating task document... <task-id>

Documents named: "Invoice-001" ↔ "Task-001-Invoice-001"

─── Triggering workflow: marking Invoice-001 as [PAID] ───

  [HH:MM:SS.mmm] updated → Invoice-001 [PAID]
  [HH:MM:SS.mmm] ⚡ Rule triggered: "Invoice-001 [PAID]" is paid
  [HH:MM:SS.mmm]    Looking for task: "Task-001-Invoice-001"...
  [HH:MM:SS.mmm]    Found task <task-id>, closing it...
  [HH:MM:SS.mmm] updated → Task-001-Invoice-001 [CLOSED]

─── Final document state ───

  Invoice: "Invoice-001 [PAID]"
  Task:    "Task-001-Invoice-001 [CLOSED]"

✓ Cross-document reaction succeeded
```
