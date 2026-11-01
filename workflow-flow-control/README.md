# Workflow Flow Control

A workflow can branch and repeat without code. The Core router picks one of several named branches per run, and the Core loop runs its body once per item. This recipe builds a workflow of the two nested, then runs it through the engine's own coordinator (`runWorkflow` from `@powerhousedao/reactor-workflow/testing`). No reactor is started.

Needs `@powerhousedao/reactor-workflow` with router and loop blocks (powerhouse PR #3358). **That change is not in a published release yet: the version pinned in `package.json` must move to the first dev build that has it.**

## How it works

- **Loop.** `each_order` takes `items`, an expression resolving to a list. Its body hangs off the `each` port, and the steps after the loop hang off `next`. Inside the body, `{{steps.each_order.output.item}}` is the current item.
- **Router.** `route` holds named branches, each with one condition. The first that holds wins, otherwise the run takes `otherwise`. Ports are `branch_1..N` and `otherwise`.
- **Journal.** Each iteration's steps are journaled under their own path, `each_order[2]/route`, so the run view lists one row per iteration.
- **Empty list.** The body is skipped and the flow continues on `next`.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/flow.ts` | The workflow definition and `runOrders`, which runs it with Core blocks in process and a recorder standing in for every other piece |
| `src/flow.test.ts` | Each order lands on its own branch; an empty batch still reaches the summary step |
| `src/demo.ts` | Runs three orders and prints the journal |

Not covered: sub-flows (Callable workflow, Call workflow), which need a host serving the called workflow.
