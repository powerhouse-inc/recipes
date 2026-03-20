import type { OperationWithContext } from "@powerhousedao/reactor";
import type { IReadModel } from "@powerhousedao/reactor";

/**
 * A custom read model that maintains a materialized count of operations
 * grouped by document type. Registered via ReactorBuilder.withReadModel(),
 * it runs in the pre-ready phase — completing before JOB_READ_READY fires.
 *
 * This implements IReadModel directly (rather than extending BaseReadModel)
 * to keep the example minimal. BaseReadModel adds catch-up/rewind via the
 * ViewState table, which is useful for persistent read models but unnecessary
 * for an in-memory counter.
 *
 * Read model vs processor:
 * - Read models are **pre-ready**: they index operations and complete
 *   *before* JOB_READ_READY is emitted. Queries see consistent data.
 * - Processors are **post-ready**: they run *after* JOB_READ_READY,
 *   suitable for side-effects (webhooks, notifications) that don't
 *   need to block the read path.
 */
export class DocumentCountReadModel implements IReadModel {
  private readonly counts = new Map<string, number>();

  async indexOperations(operations: OperationWithContext[]): Promise<void> {
    for (const op of operations) {
      const docType = op.context.documentType;
      this.counts.set(docType, (this.counts.get(docType) ?? 0) + 1);
    }
  }

  /** Returns the current operation count per document type. */
  getCounts(): ReadonlyMap<string, number> {
    return this.counts;
  }

  /** Returns the operation count for a specific document type, or 0. */
  getCount(documentType: string): number {
    return this.counts.get(documentType) ?? 0;
  }

  /** Resets all counters. */
  clear(): void {
    this.counts.clear();
  }
}
