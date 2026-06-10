import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";
// Analytics types must come from @powerhousedao/analytics-engine-core only.
// The reactor carries its own (older) copy of these types via
// @powerhousedao/shared — mixing the two breaks type identity.
import {
  AnalyticsPath,
  type AnalyticsSeriesInput,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";
import {
  expenseReportDocumentType,
  type AddLineItemInput,
  type DeleteLineItemInput,
  type LineItem,
  type UpdateLineItemInput,
} from "document-models/expense-report/v1";

/**
 * Metric name for all expense series. The store normalizes metric names to
 * PascalCase, so queries must use this exact constant to match.
 */
export const EXPENSES_METRIC = "Expenses";

/**
 * Lowercases and collapses runs of non-alphanumeric characters to a single
 * hyphen, so user data (category names) can be embedded in AnalyticsPath
 * segments without colliding with the path syntax (`/`, `:`, `,`).
 *
 * This is lossy — "Food & Drink" and "Food - Drink" map to the same slug.
 * Production code that needs round-tripping should use
 * AnalyticsPathSegment.escape() instead; slugs keep demo output readable.
 */
export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The source path identifies which series "belong" to a document, so a
 * single clearSeriesBySource wipes exactly that document's series. Branch
 * and scope stay out of the path because the processor filter already
 * restricts deliveries to main/global.
 */
export function sourcePathFor(documentId: string): AnalyticsPath {
  return AnalyticsPath.fromString(`ph/expenses/${documentId}`);
}

/**
 * Category dimension path. Categories may be hierarchical ("Headcount/Salaries"
 * becomes ph/expenses/category/headcount/salaries), which lets queries roll
 * subcategories up via the lod (level of detail) parameter.
 */
export function categoryPathFor(category: string): AnalyticsPath {
  const segments = category
    .split("/")
    .map(slugifySegment)
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) segments.push("uncategorized");
  return AnalyticsPath.fromString(
    ["ph", "expenses", "category", ...segments].join("/"),
  );
}

/** Currency dimension path, e.g. ph/expenses/currency/usd. */
export function currencyPathFor(currency: string): AnalyticsPath {
  return AnalyticsPath.fromString(
    `ph/expenses/currency/${slugifySegment(currency)}`,
  );
}

/**
 * One series value for a line item. `start` is the line item's expense date
 * (business time) — not the operation timestamp and never the processing
 * time — so monthly aggregations bucket by when the money was spent, not by
 * when the document was edited. `unit` carries the currency so amounts in
 * different currencies are never summed together.
 */
function seriesInputFor(
  source: AnalyticsPath,
  item: LineItem,
  value: number,
): AnalyticsSeriesInput {
  return {
    start: DateTime.fromISO(item.date, { zone: "utc" }),
    source,
    metric: EXPENSES_METRIC,
    value,
    unit: item.currency.toUpperCase(),
    dimensions: {
      category: categoryPathFor(item.category),
      currency: currencyPathFor(item.currency),
    },
  };
}

/**
 * Projects expense-report line-item operations into the analytics store as
 * append-only deltas:
 *
 * - ADD    → +amount at the item's date
 * - UPDATE → −old.amount at the old date, +new.amount at the new date
 *            (correct monthly attribution even when the date moves)
 * - DELETE → −old.amount at the old date
 *
 * The store has no in-place update — corrections are compensating entries,
 * which is how financial time-series stay auditable.
 *
 * Idempotency (the heart of this recipe): the processor registers with
 * startFrom "beginning", so after a restart — or whenever the reactor decides
 * to re-deliver — the full history arrives again from operation index 0.
 * Seeing index 0 for a document we already processed means "replay": clear
 * that document's series (clearSeriesBySource) and rebuild from scratch.
 * Reprocessing the same operations therefore always converges to the same
 * totals.
 *
 * The in-memory line-item cache (needed because DELETE inputs carry only an
 * id, not the amount) is lost on restart, and that is fine: the replay
 * delivers every ADD/UPDATE again and rebuilds it. Cache loss is self-healing.
 */
export class ExpenseAnalyticsProcessor implements IProcessor {
  /** docKey (documentId/branch/scope) → lineItemId → current line item. */
  private readonly lineItems = new Map<string, Map<string, LineItem>>();

  /** Documents this instance has seen an index-0 operation for. */
  private readonly seenDocuments = new Set<string>();

  constructor(private readonly store: IAnalyticsStore) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const buffer: AnalyticsSeriesInput[] = [];

    // Operations of several documents can be interleaved in one batch, but
    // per document they arrive in index order.
    for (const { operation, context } of operations) {
      const docKey = `${context.documentId}/${context.branch}/${context.scope}`;
      const source = sourcePathFor(context.documentId);

      if (operation.index === 0) {
        if (this.seenDocuments.has(docKey)) {
          // Replay detected. Flush pending writes first so the clear cannot
          // erase same-batch values queued for this document's source.
          if (buffer.length > 0) {
            await this.store.addSeriesValues(buffer.splice(0));
          }
          await this.store.clearSeriesBySource(source, true);
          this.lineItems.delete(docKey);
        }
        this.seenDocuments.add(docKey);
      }

      // Failed actions (e.g. duplicate id) record an operation with an error
      // and leave the document state unchanged — nothing to project.
      if (operation.error) continue;

      let items = this.lineItems.get(docKey);
      if (!items) {
        items = new Map<string, LineItem>();
        this.lineItems.set(docKey, items);
      }

      switch (operation.action.type) {
        case "ADD_LINE_ITEM": {
          const input = operation.action.input as AddLineItemInput;
          const item: LineItem = { ...input };
          items.set(item.id, item);
          buffer.push(seriesInputFor(source, item, item.amount));
          break;
        }
        case "UPDATE_LINE_ITEM": {
          const input = operation.action.input as UpdateLineItemInput;
          const old = items.get(input.id);
          if (!old) break; // the reducer rejects unknown ids
          const updated: LineItem = {
            id: old.id,
            amount: input.amount ?? old.amount,
            currency: input.currency ?? old.currency,
            category: input.category ?? old.category,
            date: input.date ?? old.date,
          };
          items.set(updated.id, updated);
          buffer.push(seriesInputFor(source, old, -old.amount));
          buffer.push(seriesInputFor(source, updated, updated.amount));
          break;
        }
        case "DELETE_LINE_ITEM": {
          const input = operation.action.input as DeleteLineItemInput;
          const old = items.get(input.id);
          if (!old) break;
          items.delete(input.id);
          buffer.push(seriesInputFor(source, old, -old.amount));
          break;
        }
        default:
          // Base document actions (SET_NAME, ...) are not line items.
          break;
      }
    }

    if (buffer.length > 0) {
      await this.store.addSeriesValues(buffer);
    }
  }

  async onDisconnect(): Promise<void> {
    // The analytics store's lifecycle is owned by the caller, not the
    // processor — nothing to clean up.
  }
}

/**
 * Creates a ProcessorFactory for the expense analytics processor.
 *
 * @example
 * ```ts
 * await processorManager.registerFactory(
 *   "expense-analytics",
 *   createExpenseAnalyticsFactory({ store }),
 * );
 * ```
 */
export function createExpenseAnalyticsFactory(config: {
  store: IAnalyticsStore;
  filter?: ProcessorFilter;
}): ProcessorFactory {
  return () => [
    {
      processor: new ExpenseAnalyticsProcessor(config.store),
      filter: config.filter ?? {
        documentType: [expenseReportDocumentType],
        branch: ["main"],
        scope: ["global"],
      },
      startFrom: "beginning",
    },
  ];
}
