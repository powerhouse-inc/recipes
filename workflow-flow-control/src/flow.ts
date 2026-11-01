import { blockKey } from "@powerhousedao/pieces-framework/block-type";
import { knownPorts } from "@powerhousedao/pieces-framework/workflow";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "@powerhousedao/reactor-workflow";
import {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
  runWorkflow,
} from "@powerhousedao/reactor-workflow/testing";
import type { BlockExecution } from "@powerhousedao/reactor-workflow/testing";

type Edge = { id: string; from: string; to: string; port: string };

const edge = (from: string, to: string, port = "next"): Edge => ({
  id: `${from}:${port}:${to}`,
  from,
  to,
  port,
});

const step = (id: string, config: unknown, actionName = "record") => ({
  id,
  key: id,
  pieceName: "demo",
  pieceVersion: "1.0.0",
  actionName,
  config,
});

const coreStep = (id: string, actionName: string, config: unknown) => ({
  ...step(id, config, actionName),
  pieceName: CORE_PIECE_NAME,
  pieceVersion: CORE_PIECE_VERSION,
});

// The trigger payload is `{ orders: [{ id, status }] }`. The loop visits each
// order; inside its body a router sends the order down one branch.
export const definition = {
  trigger: {
    id: "t",
    pieceName: CORE_PIECE_NAME,
    pieceVersion: CORE_PIECE_VERSION,
    triggerName: "manual",
    config: {},
  },
  steps: [
    coreStep("each_order", "loop", { items: "{{trigger.payload.orders}}" }),
    coreStep("route", "router", {
      branches: [
        {
          name: "Paid",
          left: "{{steps.each_order.output.item.status}}",
          operator: "TEXT_EXACTLY_MATCHES",
          right: "paid",
        },
        {
          name: "Refunded",
          left: "{{steps.each_order.output.item.status}}",
          operator: "TEXT_EXACTLY_MATCHES",
          right: "refunded",
        },
      ],
    }),
    step("ship", { order: "{{steps.each_order.output.item.id}}" }),
    step("refund", { order: "{{steps.each_order.output.item.id}}" }),
    step("review", { order: "{{steps.each_order.output.item.id}}" }),
    step("summary", { orders: "{{steps.each_order.output.count}}" }),
  ],
  edges: [
    edge("t", "each_order"),
    edge("each_order", "route", "each"),
    edge("route", "ship", "branch_1"),
    edge("route", "refund", "branch_2"),
    edge("route", "review", "otherwise"),
    edge("each_order", "summary"),
  ],
};

// Stands in for a real piece: records its resolved config.
class Recorder {
  readonly calls: BlockExecution[] = [];
  execute(execution: BlockExecution) {
    this.calls.push(execution);
    return Promise.resolve({ output: execution.config });
  }
}

export async function runOrders(orders: { id: string; status: string }[]) {
  const recorder = new Recorder();
  // Router and loop are core blocks the engine runs in process.
  const core = new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" });
  const coreBlock = (name: string) =>
    blockKey({ pieceName: CORE_PIECE_NAME, kind: "action", name });
  const executor = new CompositeBlockExecutor(recorder, {
    [coreBlock("router")]: core,
    [coreBlock("loop")]: core,
  });
  const journal: string[] = [];
  const result = await runWorkflow({
    definition,
    executor,
    triggerPayload: { orders },
    declaredPorts: knownPorts,
    onStep: (record) => {
      journal.push(`${record.path ?? record.stepId} ${record.status}`);
    },
  });
  return { result, journal, calls: recorder.calls };
}
