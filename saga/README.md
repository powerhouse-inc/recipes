# Saga

Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context.

## What it demonstrates

- **`IProcessor` as a saga coordinator**: `SagaProcessor.onOperations` reacts to incoming operations and dispatches the follow-up actions on other documents through `IReactor.execute()`
- **Saga correlation via DB**: a `saga_id` ties every step together, tracked entirely in the processor's own `saga_log` table (no changes to document interfaces)
- A re-entrancy guard keeps the processor from reacting to its own dispatched operations. `SagaProcessor` sets a `processing` flag while it dispatches, and `onOperations` returns immediately whenever that flag is already set (`src/processor.ts`).

## How it works

1. Creates a drive, the container document the others live under, holding **Order-001**, **Payment-001**, and **Fulfillment-001**
2. Registers a `SagaProcessor` whose step definitions chain the renames: `Order-001 [CREATED]` dispatches `Payment-001 [REQUESTED]`, which dispatches `Fulfillment-001 [STARTED]`, which closes the saga with `Order-001 [FULFILLED]`
3. Triggering the saga by renaming the order document cascades through all three steps

## Running

```sh
pnpm install
pnpm --filter @powerhousedao/saga start
```

## Expected output

```
Saga Pattern Demo
==================

Demonstrates: processor-based saga coordination across documents,
with a traceable saga_id linking every step.

  Starting reactor... done (X.Xs)

  Creating drive... <drive-id>
  Creating order document... <order-id>
  Creating payment document... <payment-id>
  Creating fulfillment document... <fulfillment-id>

  Documents named: "Order-001", "Payment-001", "Fulfillment-001"

  Registered saga processor

--- Triggering saga: renaming Order-001 to Order-001 [CREATED] ---

--- Final document state ---

  Order:       "Order-001 [FULFILLED]"
  Payment:     "Payment-001 [REQUESTED]"
  Fulfillment: "Fulfillment-001 [STARTED]"

--- Saga log ---

  Saga ID: <uuid>

  Step: order-created
    <order-id> -> <payment-id>
    action: SET_NAME  status: dispatched
  Step: payment-requested
    <payment-id> -> <fulfillment-id>
    action: SET_NAME  status: dispatched
  Step: fulfillment-started
    <fulfillment-id> -> <order-id>
    action: SET_NAME  status: dispatched

+ Saga completed successfully
```
