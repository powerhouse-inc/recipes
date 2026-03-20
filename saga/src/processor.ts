import type { OperationWithContext } from "document-model";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/reactor";
import type { IReactor } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import { setName } from "document-model";
import type { SagaDB } from "./schema.js";

/**
 * A single step in a saga definition.
 *
 * - `triggerActionType`: the action type that activates this step (e.g. "SET_NAME")
 * - `triggerMatch`: predicate on the operation to decide if this step applies
 * - `stepName`: human-readable label for the saga log
 * - `isInitial`: true if this step starts a new saga (generates a new saga_id)
 * - `resolveTargetDocumentId`: given the triggering operation, returns the
 *    document ID to dispatch the follow-up action to
 * - `buildActions`: produces the actions to dispatch on the target document
 */
export type SagaStepDefinition = {
  stepName: string;
  triggerActionType: string;
  triggerMatch: (op: OperationWithContext) => boolean;
  isInitial: boolean;
  resolveTargetDocumentId: (op: OperationWithContext) => string;
  buildActions: (op: OperationWithContext) => { type: string; input: any }[];
};

/**
 * A Reactor processor that implements the saga pattern.
 *
 * When an operation matches a saga step definition, the processor:
 * 1. Resolves or creates a saga_id (new for initial steps, looked up from DB for subsequent steps)
 * 2. Dispatches follow-up actions to a target document via IReactor.execute()
 * 3. Logs the step to the saga_log table for traceability
 *
 * A re-entrancy guard prevents the processor from reacting to its own dispatched operations.
 */
export class SagaProcessor implements IProcessor {
  private processing = false;

  constructor(
    private readonly db: Kysely<SagaDB>,
    private readonly reactor: IReactor,
    private readonly steps: SagaStepDefinition[],
  ) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (this.processing) return;

    for (const op of operations) {
      const actionType = op.operation.action.type;

      for (const step of this.steps) {
        if (step.triggerActionType !== actionType) continue;
        if (!step.triggerMatch(op)) continue;

        // Resolve saga_id
        let sagaId: string;
        if (step.isInitial) {
          sagaId = crypto.randomUUID();
        } else {
          // Look up saga_id: the current document was previously a target
          const row = await this.db
            .selectFrom("saga_log")
            .select("saga_id")
            .where("target_document_id", "=", op.context.documentId)
            .orderBy("id", "desc")
            .limit(1)
            .executeTakeFirst();

          if (!row) continue; // no saga context found — skip
          sagaId = row.saga_id;
        }

        const targetDocId = step.resolveTargetDocumentId(op);
        const actions = step.buildActions(op);

        // Log the step
        await this.db
          .insertInto("saga_log")
          .values({
            saga_id: sagaId,
            step_name: step.stepName,
            source_document_id: op.context.documentId,
            target_document_id: targetDocId,
            action_type: actionType,
            status: "dispatched",
          })
          .execute();

        // Dispatch follow-up actions to the target document
        this.processing = true;
        try {
          for (const action of actions) {
            if (action.type === "SET_NAME") {
              await this.reactor.execute(
                targetDocId,
                "main",
                [setName(action.input.name)],
              );
            }
          }
        } finally {
          this.processing = false;
        }
      }
    }
  }

  async onDisconnect(): Promise<void> {}
}

/**
 * Creates a ProcessorFactory for a SagaProcessor.
 *
 * @example
 * ```ts
 * await processorManager.registerFactory(
 *   "saga",
 *   createSagaFactory({
 *     db,
 *     reactor,
 *     steps: [...],
 *     filter: { branch: ["main"] },
 *   }),
 * );
 * ```
 */
export function createSagaFactory(config: {
  db: Kysely<SagaDB>;
  reactor: IReactor;
  steps: SagaStepDefinition[];
  filter: ProcessorFilter;
}): ProcessorFactory {
  return () => [
    {
      processor: new SagaProcessor(config.db, config.reactor, config.steps),
      filter: config.filter,
      startFrom: "beginning",
    },
  ];
}
