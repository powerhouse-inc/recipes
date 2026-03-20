# Saga

Saga pattern via Reactor processor: operations on one document trigger operations on others, linked by a traceable saga context.

## What it demonstrates

- **`IProcessor` as a saga coordinator** — a processor that reacts to operations and dispatches follow-up actions on other documents
- **Saga correlation via DB** — a `saga_id` ties every step together, tracked entirely in the processor's own table (no changes to document interfaces)
- **`IReactor.execute()` from within a processor** — the processor dispatches actions to other documents in response to incoming operations
- **Re-entrancy guard** — prevents the processor from reacting to its own dispatched operations

## How it works

1. Creates a drive with three documents: **Order-001**, **Payment-001**, and **Fulfillment-001**
2. Registers a `SagaProcessor` with step definitions that form a chain:
   - `Order-001 [CREATED]` &rarr; dispatches rename on Payment to `Payment-001 [REQUESTED]`
   - `Payment-001 [REQUESTED]` &rarr; dispatches rename on Fulfillment to `Fulfillment-001 [STARTED]`
   - `Fulfillment-001 [STARTED]` &rarr; dispatches rename on Order to `Order-001 [FULFILLED]`
3. Triggering the saga by renaming the order document cascades through all three steps
4. The saga log table records every step with a shared `saga_id` for traceability

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

## License

AGPL-3.0-only
