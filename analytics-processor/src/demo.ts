/**
 * analytics-processor demo.
 *
 * Boots a reactor, registers the expense analytics processor, dispatches a
 * small story of expense line items (adds, an amount correction, a delete),
 * then queries the analytics engine for totals per category, monthly totals,
 * and a category × currency breakdown.
 *
 * Everything runs in-process: the analytics store is PGlite-backed
 * (an embedded PostgreSQL), so `pnpm start` needs no external services.
 */
import { PGlite } from "@electric-sql/pglite";
import { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import { JobAwaiter, ReactorBuilder } from "@powerhousedao/reactor";
import type { Action } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { driveCreateDocument, driveDocumentModelModule } from "document-drive";
import { DateTime } from "luxon";
import {
  addLineItem,
  deleteLineItem,
  ExpenseReport,
  updateLineItem,
  utils as expenseReportUtils,
} from "document-models/expense-report/v1";
import { createExpenseAnalyticsFactory } from "./processor.js";
import {
  dimensionLabel,
  printTable,
  queryCategoryByCurrency,
  queryMonthlyTotals,
  queryTotalByCategory,
} from "./query.js";

async function main() {
  console.log("Analytics Processor Demo");
  console.log("========================\n");
  console.log(
    "Demonstrates: projecting expense-report operations into the analytics",
  );
  console.log(
    "engine and querying time-series aggregations back out.\n",
  );

  // 1. In-process analytics store (PGlite) + query engine
  const pgLite = await PGlite.create();
  const store = new BrowserAnalyticsStore({ pgLite });
  await store.init();
  const engine = new AnalyticsQueryEngine(store);
  console.log("Analytics store initialized (in-memory PGlite)");

  // 2. Build the reactor
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      ExpenseReport,
    ])
    .buildModule();
  const { reactor, eventBus, processorManager } = reactorModule;
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  // 3. Register the analytics processor (default filter: expense-report
  //    documents, main branch, global scope, startFrom "beginning")
  await processorManager.registerFactory(
    "expense-analytics",
    createExpenseAnalyticsFactory({ store }),
  );
  console.log("Registered expense analytics processor");

  // 4. Processor factories activate per drive, so create one
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(`Created drive ${driveDoc.header.id}\n`);

  // 5. Create three expense report documents
  console.log("--- Creating expense reports ---\n");
  const reports = [
    { label: "Q1 Travel" },
    { label: "Software" },
    { label: "Headcount" },
  ].map((r) => ({ ...r, document: expenseReportUtils.createDocument() }));

  for (const report of reports) {
    const job = await reactor.create(report.document);
    await jobAwaiter.waitForJob(job.id);
    console.log(`  ${report.label}: ${report.document.header.id}`);
  }
  const [travel, software, headcount] = reports.map(
    (r) => r.document.header.id,
  );

  // 6. Dispatch the line item story
  console.log("\n--- Dispatching line items ---\n");
  const story: { docId: string; action: Action; note: string }[] = [
    { docId: travel, action: addLineItem({ id: "t-1", amount: 1200, currency: "USD", category: "Travel/Flights", date: "2025-01-12" }), note: "ADD    Travel/Flights          1200.00 USD  2025-01" },
    { docId: travel, action: addLineItem({ id: "t-2", amount: 840, currency: "USD", category: "Travel/Hotels", date: "2025-01-13" }), note: "ADD    Travel/Hotels            840.00 USD  2025-01" },
    { docId: travel, action: addLineItem({ id: "t-3", amount: 320, currency: "EUR", category: "Travel/Meals", date: "2025-01-14" }), note: "ADD    Travel/Meals             320.00 EUR  2025-01" },
    { docId: software, action: addLineItem({ id: "s-1", amount: 2400, currency: "USD", category: "Software/Subscriptions", date: "2025-02-01" }), note: "ADD    Software/Subscriptions  2400.00 USD  2025-02" },
    { docId: software, action: addLineItem({ id: "s-2", amount: 180, currency: "EUR", category: "Software/Subscriptions", date: "2025-02-03" }), note: "ADD    Software/Subscriptions   180.00 EUR  2025-02" },
    { docId: software, action: addLineItem({ id: "s-3", amount: 960, currency: "USD", category: "Software/Tools", date: "2025-02-10" }), note: "ADD    Software/Tools           960.00 USD  2025-02" },
    { docId: headcount, action: addLineItem({ id: "h-1", amount: 18000, currency: "USD", category: "Headcount/Salaries", date: "2025-03-01" }), note: "ADD    Headcount/Salaries     18000.00 USD  2025-03" },
    { docId: headcount, action: addLineItem({ id: "h-2", amount: 3600, currency: "USD", category: "Headcount/Benefits", date: "2025-03-01" }), note: "ADD    Headcount/Benefits      3600.00 USD  2025-03" },
    { docId: headcount, action: addLineItem({ id: "h-3", amount: 4500, currency: "USD", category: "Headcount/Contractors", date: "2025-03-05" }), note: "ADD    Headcount/Contractors   4500.00 USD  2025-03" },
    { docId: headcount, action: updateLineItem({ id: "h-3", amount: 5000 }), note: "UPDATE Headcount/Contractors   5000.00 USD  2025-03  (corrected)" },
    { docId: travel, action: deleteLineItem({ id: "t-3" }), note: "DELETE Travel/Meals             320.00 EUR  2025-01  (removed)" },
  ];

  const lastJobPerDoc = new Map<string, Awaited<ReturnType<typeof jobAwaiter.waitForJob>>>();
  for (const step of story) {
    const job = await reactor.execute(step.docId, "main", [step.action]);
    const completed = await jobAwaiter.waitForJob(job.id);
    lastJobPerDoc.set(step.docId, completed);
    console.log(`  ${step.note}`);
  }

  // 7. Wait until the processor has consumed each document's final
  //    operation — deterministic, no sleep. The processor manager's
  //    consistency tracker advances as processors commit operations.
  process.stdout.write("\nWaiting for the processor to catch up...");
  const coordinates = [...lastJobPerDoc.values()].flatMap(
    (job) => job.consistencyToken.coordinates,
  );
  await reactorModule.processorManagerConsistencyTracker.waitFor(
    coordinates,
    10_000,
  );
  console.log(" done\n");

  // 8. Query the analytics engine
  const window = {
    start: DateTime.utc(2025, 1, 1),
    end: DateTime.utc(2026, 1, 1),
  };

  console.log("Query 1 — Total spend per category (2025, all currencies):\n");
  const byCategory = await queryTotalByCategory(engine, window);
  printTable(
    ["Category", "Currency", "Total"],
    byCategory
      .flatMap((period) => period.rows)
      .map((row) => [dimensionLabel(row, "category"), row.unit ?? "", row.value] as const)
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || (b[2] as number) - (a[2] as number))
      .map((row) => [...row]),
  );
  console.log(
    "  Note: travel/meals shows 0.00 — the DELETE wrote a compensating",
  );
  console.log("  -320.00 entry rather than erasing history.\n");

  console.log("Query 2 — Monthly totals (USD only):\n");
  const monthly = await queryMonthlyTotals(engine, window, {
    currency: "USD",
  });
  printTable(
    ["Month", "USD Total"],
    monthly
      .map((period) => {
        const total = period.rows.reduce((acc, row) => acc + row.value, 0);
        return [period.start.toFormat("yyyy-MM"), total] as (string | number)[];
      })
      .filter((row) => row[1] !== 0),
  );
  console.log();

  console.log(
    "Query 3 — Category × currency (lod rolls subcategories up):\n",
  );
  const pivot = await queryCategoryByCurrency(engine, window);
  printTable(
    ["Category", "Currency", "Total"],
    pivot
      .flatMap((period) => period.rows)
      .map((row) => [dimensionLabel(row, "category"), dimensionLabel(row, "currency").toUpperCase(), row.value] as const)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))
      .map((row) => [...row]),
  );
  console.log(
    "  Note: lod { category: 4 } truncated Headcount/Salaries, /Benefits and",
  );
  console.log(
    "  /Contractors into a single 'headcount' row.\n",
  );

  // 9. Cleanup
  await store.destroy();
  reactor.kill();
  console.log("+ Demo complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
