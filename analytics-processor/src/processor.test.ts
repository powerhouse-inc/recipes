import { PGlite } from "@electric-sql/pglite";
import { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import {
  AnalyticsGranularity,
  AnalyticsPath,
  AnalyticsQueryEngine,
  type GroupedPeriodResults,
} from "@powerhousedao/analytics-engine-core";
import type { Action, OperationWithContext } from "document-model";
import { DateTime } from "luxon";
import {
  addLineItem,
  deleteLineItem,
  expenseReportDocumentType,
  updateLineItem,
} from "document-models/expense-report/v1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  categoryPathFor,
  EXPENSES_METRIC,
  ExpenseAnalyticsProcessor,
  slugifySegment,
  sourcePathFor,
} from "./processor.js";

const CATEGORY_ROOT = AnalyticsPath.fromString("ph/expenses/category");

function makeOp(opts: {
  documentId: string;
  index: number;
  action: Action;
  error?: string;
}): OperationWithContext {
  return {
    operation: {
      id: `op-${opts.documentId}-${opts.index}`,
      index: opts.index,
      skip: 0,
      timestampUtcMs: "2025-06-01T00:00:00.000Z",
      hash: "",
      error: opts.error,
      action: opts.action,
    },
    context: {
      documentId: opts.documentId,
      documentType: expenseReportDocumentType,
      scope: "global",
      branch: "main",
      ordinal: opts.index,
    },
  };
}

/** Wraps actions for one document into operations indexed from 0. */
function opsFor(documentId: string, actions: Action[]): OperationWithContext[] {
  return actions.map((action, index) => makeOp({ documentId, index, action }));
}

const item = (overrides: Partial<Parameters<typeof addLineItem>[0]> = {}) => ({
  id: "li-1",
  amount: 100,
  currency: "USD",
  category: "Travel",
  date: "2025-01-15",
  ...overrides,
});

describe("ExpenseAnalyticsProcessor", () => {
  let pgLite: PGlite;
  let store: BrowserAnalyticsStore;
  let engine: AnalyticsQueryEngine;
  let processor: ExpenseAnalyticsProcessor;

  beforeEach(async () => {
    pgLite = await PGlite.create();
    store = new BrowserAnalyticsStore({ pgLite });
    await store.init();
    engine = new AnalyticsQueryEngine(store);
    processor = new ExpenseAnalyticsProcessor(store);
  });

  afterEach(async () => {
    await store.destroy();
  });

  function allSeries() {
    return store.getMatchingSeries({
      start: null,
      end: null,
      metrics: [EXPENSES_METRIC],
      select: { category: [CATEGORY_ROOT] },
    });
  }

  async function totalsByUnit(currency?: string): Promise<Map<string, number>> {
    // The discretizer derives missing start/end from the data, which breaks
    // down when all series share a single date — always pass a window.
    const results: GroupedPeriodResults = await engine.execute({
      start: DateTime.utc(2020, 1, 1),
      end: DateTime.utc(2030, 1, 1),
      granularity: AnalyticsGranularity.Total,
      metrics: [EXPENSES_METRIC],
      currency: currency ? AnalyticsPath.fromString(currency) : undefined,
      select: { category: [CATEGORY_ROOT] },
      lod: { category: 5 },
    });
    const totals = new Map<string, number>();
    for (const period of results) {
      for (const row of period.rows) {
        const unit = row.unit ?? "?";
        totals.set(unit, (totals.get(unit) ?? 0) + row.value);
      }
    }
    return totals;
  }

  it("writes a series value for ADD_LINE_ITEM", async () => {
    await processor.onOperations(opsFor("doc-a", [addLineItem(item())]));

    const series = await allSeries();
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(100);
    expect(series[0].unit).toBe("USD");
    expect(series[0].start.toISODate()).toBe("2025-01-15");
    expect(series[0].source.toString()).toBe(
      sourcePathFor("doc-a").toString(),
    );
  });

  it("cancels an ADD with a compensating entry on DELETE_LINE_ITEM", async () => {
    await processor.onOperations(
      opsFor("doc-a", [addLineItem(item()), deleteLineItem({ id: "li-1" })]),
    );

    const series = await allSeries();
    expect(series).toHaveLength(2);
    expect(series.map((s) => s.value).sort((a, b) => a - b)).toEqual([
      -100, 100,
    ]);
    expect((await totalsByUnit()).get("USD")).toBe(0);
  });

  it("replaces the amount on UPDATE_LINE_ITEM at the same date", async () => {
    await processor.onOperations(
      opsFor("doc-a", [
        addLineItem(item()),
        updateLineItem({ id: "li-1", amount: 150 }),
      ]),
    );

    const series = await allSeries();
    expect(series.map((s) => s.value).sort((a, b) => a - b)).toEqual([
      -100, 100, 150,
    ]);
    expect((await totalsByUnit()).get("USD")).toBe(150);
  });

  it("moves the amount between months when an UPDATE changes the date", async () => {
    await processor.onOperations(
      opsFor("doc-a", [
        addLineItem(item({ date: "2025-01-15" })),
        updateLineItem({ id: "li-1", date: "2025-03-15" }),
      ]),
    );

    const results = await engine.execute({
      start: DateTime.utc(2025, 1, 1),
      end: DateTime.utc(2025, 5, 1),
      granularity: AnalyticsGranularity.Monthly,
      metrics: [EXPENSES_METRIC],
      select: { category: [CATEGORY_ROOT] },
      lod: { category: 3 },
    });

    const byMonth = new Map<number, number>();
    for (const period of results) {
      const month = period.start.toUTC().month;
      const sum = period.rows.reduce((acc, row) => acc + row.value, 0);
      byMonth.set(month, (byMonth.get(month) ?? 0) + sum);
    }
    expect(byMonth.get(1) ?? 0).toBe(0); // +100 and -100 cancel in January
    expect(byMonth.get(3)).toBe(100); // the amount lands in March
  });

  it("converges to the same totals when the history is re-delivered", async () => {
    const ops = opsFor("doc-a", [
      addLineItem(item({ id: "li-1", amount: 100, category: "Travel" })),
      addLineItem(item({ id: "li-2", amount: 40, category: "Software" })),
      addLineItem(item({ id: "li-3", amount: 60, category: "Travel" })),
    ]);

    await processor.onOperations(ops);
    const first = await totalsByUnit();
    expect(first.get("USD")).toBe(200);

    // Same operations again, starting at index 0 — e.g. the processor was
    // restarted and the reactor replays from the beginning.
    await processor.onOperations(ops);
    const second = await totalsByUnit();
    expect(second.get("USD")).toBe(200);
    expect(await allSeries()).toHaveLength(3); // cleared and rebuilt, not appended
  });

  it("clears only the replayed document's series", async () => {
    const opA = makeOp({
      documentId: "doc-a",
      index: 0,
      action: addLineItem(item({ id: "a-1", amount: 100 })),
    });
    const opB = makeOp({
      documentId: "doc-b",
      index: 0,
      action: addLineItem(item({ id: "b-1", amount: 50 })),
    });

    // Interleaved batch, then a replay of doc-a only.
    await processor.onOperations([opA, opB]);
    await processor.onOperations([opA]);

    const series = await allSeries();
    const countBySource = new Map<string, number>();
    for (const s of series) {
      const key = s.source.toString();
      countBySource.set(key, (countBySource.get(key) ?? 0) + 1);
    }
    expect(countBySource.get(sourcePathFor("doc-a").toString())).toBe(1);
    expect(countBySource.get(sourcePathFor("doc-b").toString())).toBe(1);
  });

  it("slugifies user data into safe dimension path segments", () => {
    expect(slugifySegment("Food & Drink")).toBe("food-drink");
    const path = categoryPathFor("Food & Drink/Café, stuff:things");
    expect(path.toString()).toBe(
      AnalyticsPath.fromString(
        "ph/expenses/category/food-drink/caf-stuff-things",
      ).toString(),
    );
  });

  it("keeps currencies in separate series and never sums across units", async () => {
    await processor.onOperations(
      opsFor("doc-a", [
        addLineItem(item({ id: "li-1", amount: 100, currency: "USD" })),
        addLineItem(item({ id: "li-2", amount: 80, currency: "EUR" })),
      ]),
    );

    const usdOnly = await totalsByUnit("USD");
    expect(usdOnly.get("USD")).toBe(100);
    expect(usdOnly.has("EUR")).toBe(false);

    const eurOnly = await totalsByUnit("EUR");
    expect(eurOnly.get("EUR")).toBe(80);
    expect(eurOnly.has("USD")).toBe(false);

    const all = await totalsByUnit();
    expect(all.get("USD")).toBe(100);
    expect(all.get("EUR")).toBe(80);
  });

  it("ignores operations that failed in the reducer", async () => {
    const ok = makeOp({
      documentId: "doc-a",
      index: 0,
      action: addLineItem(item({ id: "li-1" })),
    });
    const failed = makeOp({
      documentId: "doc-a",
      index: 1,
      action: addLineItem(item({ id: "li-1" })),
      error: "Line item li-1 already exists",
    });

    await processor.onOperations([ok, failed]);

    expect(await allSeries()).toHaveLength(1);
    expect((await totalsByUnit()).get("USD")).toBe(100);
  });
});
