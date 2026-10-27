import type { IProcessor } from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";

/** What one `onOperations` call saw for one operation. */
export type Delivery = {
  ordinal: number;
  /** The operation's scope; a replay stream is one document, scope and branch. */
  scope: string;
  actionType: string;
  /** The name in `context.resultingState`, or `null` when no state came with it. */
  stateName: string | null;
};

/**
 * Records every operation it is given and the document name found in the
 * operation's `resultingState`. It does no work with the operations, so what
 * differs between two recorders is only the record's `replayState`.
 */
export class DeliveryRecorder implements IProcessor {
  readonly deliveries: Delivery[] = [];

  onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      this.deliveries.push({
        ordinal: context.ordinal,
        scope: context.scope,
        actionType: operation.action.type,
        stateName: readName(context.resultingState),
      });
    }
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}

function readName(resultingState: string | undefined): string | null {
  if (!resultingState) return null;
  const state = JSON.parse(resultingState) as { header?: { name?: string } };
  return state.header?.name ?? "";
}
