# Cross-Document Reactor

Event-driven cross-document automation using `ReactorClient` subscriptions.

## What it demonstrates

- **`reactorClient.subscribe()`** — broad subscription watching all document changes
- **Cross-document workflows** — a change on one document triggers an action on a related document
- **`execute()` from within a subscription handler** — the reactor as an event-driven automation engine

## How it works

1. Creates a drive with two documents: an **invoice** and a **task**, linked by naming convention (`Invoice-001` ↔ `Task-001-Invoice-001`)
2. Subscribes to all document changes with an empty search filter (`{}`)
3. When the invoice is renamed to include `[PAID]`, the subscription handler finds the related task and renames it to include `[CLOSED]`

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

## License

AGPL-3.0-only
