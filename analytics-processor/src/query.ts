import {
  AnalyticsGranularity,
  AnalyticsPath,
  type AnalyticsQueryEngine,
  type GroupedPeriodResult,
  type GroupedPeriodResults,
} from "@powerhousedao/analytics-engine-core";
import type { DateTime } from "luxon";
import { EXPENSES_METRIC } from "./processor.js";

const CATEGORY_ROOT = AnalyticsPath.fromString("ph/expenses/category");
const CURRENCY_ROOT = AnalyticsPath.fromString("ph/expenses/currency");

/**
 * Every query takes an explicit time window. The engine can derive a missing
 * window from the stored series, but that breaks down on degenerate data
 * (e.g. everything on a single date) — being explicit is both more robust
 * and clearer about what is being aggregated.
 */
export type QueryWindow = {
  start: DateTime;
  end: DateTime;
};

/**
 * Total spend per category (full category depth), one row per
 * category × currency. `lod.category: 5` keeps dimension paths at their full
 * depth: ph/expenses/category/<category>/<subcategory>.
 *
 * The optional `currency` filters on the series **unit** column — pass a bare
 * ISO currency code such as "USD", not the currency dimension path
 * ("ph/expenses/currency/usd"); a dimension path would silently match nothing.
 */
export async function queryTotalByCategory(
  engine: AnalyticsQueryEngine,
  window: QueryWindow,
  opts: { currency?: string } = {},
): Promise<GroupedPeriodResults> {
  return engine.execute({
    start: window.start,
    end: window.end,
    granularity: AnalyticsGranularity.Total,
    metrics: [EXPENSES_METRIC],
    currency: opts.currency
      ? AnalyticsPath.fromString(opts.currency)
      : undefined,
    select: { category: [CATEGORY_ROOT] },
    lod: { category: 5 },
  });
}

/**
 * Spend per calendar month. `lod.category: 3` truncates every category path
 * to ph/expenses/category, collapsing all categories into a single row per
 * month × currency. The optional `currency` filters on the series **unit**
 * column — pass a bare ISO currency code such as "USD", not the currency
 * dimension path ("ph/expenses/currency/usd"); a dimension path would
 * silently match nothing.
 */
export async function queryMonthlyTotals(
  engine: AnalyticsQueryEngine,
  window: QueryWindow,
  opts: { currency?: string } = {},
): Promise<GroupedPeriodResults> {
  return engine.execute({
    start: window.start,
    end: window.end,
    granularity: AnalyticsGranularity.Monthly,
    metrics: [EXPENSES_METRIC],
    currency: opts.currency
      ? AnalyticsPath.fromString(opts.currency)
      : undefined,
    select: { category: [CATEGORY_ROOT] },
    lod: { category: 3 },
  });
}

/**
 * Multi-dimension breakdown: top-level category × currency.
 * `lod.category: 4` truncates ph/expenses/category/<category>/<subcategory>
 * to ph/expenses/category/<category>, rolling subcategories up into their
 * parent. Every key in `select` needs a matching `lod` entry — dimensions
 * without one are dropped from the result.
 */
export async function queryCategoryByCurrency(
  engine: AnalyticsQueryEngine,
  window: QueryWindow,
): Promise<GroupedPeriodResults> {
  return engine.execute({
    start: window.start,
    end: window.end,
    granularity: AnalyticsGranularity.Total,
    metrics: [EXPENSES_METRIC],
    select: {
      category: [CATEGORY_ROOT],
      currency: [CURRENCY_ROOT],
    },
    lod: { category: 4, currency: 4 },
  });
}

/**
 * Display label for a dimension value: the path with the
 * ph/expenses/<dimension>/ prefix stripped, e.g. "travel/flights".
 */
export function dimensionLabel(
  row: GroupedPeriodResult["rows"][number],
  dimension: string,
): string {
  const path = String(row.dimensions[dimension]?.path ?? "");
  const prefix = `ph/expenses/${dimension}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Renders an aligned box-drawing table — keeps the demo dependency-free.
 * Numbers are right-aligned, everything else left-aligned.
 */
export function printTable(
  headers: string[],
  rows: (string | number)[][],
): void {
  const cells = rows.map((row) =>
    row.map((cell) =>
      typeof cell === "number" ? formatAmount(cell) : String(cell),
    ),
  );
  const numeric = headers.map((_, col) =>
    rows.every((row) => typeof row[col] === "number"),
  );
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...cells.map((row) => row[col].length)),
  );

  const line = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;
  const format = (row: string[]) =>
    "│" +
    row
      .map((cell, col) =>
        numeric[col]
          ? ` ${cell.padStart(widths[col])} `
          : ` ${cell.padEnd(widths[col])} `,
      )
      .join("│") +
    "│";

  console.log(line("┌", "┬", "┐"));
  console.log(format(headers.map((h, col) => h.padEnd(widths[col]))));
  console.log(line("├", "┼", "┤"));
  for (const row of cells) console.log(format(row));
  console.log(line("└", "┴", "┘"));
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
