import { ReactorBuilder, JobAwaiter } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { scriptedFeed } from "./feed.js";
import {
  createFeedLedgerDocument,
  FeedLedger,
  type FeedLedgerDocument,
} from "document-models/feed-ledger/v1";
import { FeedPoller } from "./poller.js";

const SOURCE = "invoices-feed";

function printLedger(doc: FeedLedgerDocument) {
  const g = doc.state.global;
  console.log(`  source:    ${g.source}`);
  console.log(`  watermark: ${g.watermark}`);
  console.log("  entries:");
  for (const e of g.entries) {
    const tag = e.status === "SUPERSEDED" ? `SUPERSEDED → ${e.supersededBy}` : "RECORDED";
    console.log(
      `    [${e.sequence}] ${e.externalId.padEnd(9)} ${tag.padEnd(28)} ${e.payload}`,
    );
  }
}

async function main() {
  console.log("External Feed Ingest Demo");
  console.log("═════════════════════════\n");
  console.log("A polling worker ingests an external feed into a ledger document,");
  console.log("idempotently. The document is the checkpoint store, so the poller");
  console.log("survives a restart with no side database and no double-ingest.\n");

  // 1. Build a reactor that knows about the ledger document model.
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const { reactor, eventBus } = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      FeedLedger,
    ])
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 2. Create the ledger document for this feed source.
  const ledgerDoc = createFeedLedgerDocument({ global: { source: SOURCE } });
  const createJob = await reactor.create(ledgerDoc);
  await jobAwaiter.waitForJob(createJob.id);
  const documentId = ledgerDoc.header.id;
  console.log(`Created ledger document ${documentId} for "${SOURCE}"\n`);

  // The scripted feed: normal events, an out-of-order timestamp, a duplicate
  // redelivery, and a correction of an earlier event.
  const feed = scriptedFeed();

  // 3. FIRST poller — ingests only the events available so far, then we kill it
  //    mid-stream to simulate a crash. We drive pollOnce() explicitly so the
  //    kill point is deterministic; start()/stop() is the production loop.
  console.log("─── Poller #1 starts, ingests the first batch, then is killed ───\n");
  const poller1 = new FeedPoller(reactor, eventBus, documentId, {
    // A truncated view of the feed: cursors 1–3 only. Simulates the poller
    // dying before upstream delivered the rest.
    fetchSince: async (since) =>
      (await feed.fetchSince(since)).filter((e) => e.sequence <= 3),
  });
  await poller1.seedFromState();
  const r1 = await poller1.pollOnce();
  console.log(`  recorded:   ${JSON.stringify(r1.recorded)}`);
  console.log(`  watermark:  ${r1.watermark}`);
  poller1.shutdown(); // crash: in-memory dedup set + watermark are gone
  console.log("  ✗ poller #1 killed (its in-memory cache is discarded)\n");

  // 4. SECOND poller — a fresh process. It knows nothing in memory; it must
  //    rebuild from the document. Now it sees the full feed, including the
  //    duplicate redelivery of po-002 and the correction of po-001.
  console.log("─── Poller #2 starts fresh, re-seeds from document state ───\n");
  const poller2 = new FeedPoller(reactor, eventBus, documentId, feed);
  await poller2.seedFromState();
  console.log(
    `  re-seeded: watermark=${poller2.currentWatermark}, ${poller2.seenCount} known ids\n`,
  );
  const r2 = await poller2.pollOnce();
  console.log(`  recorded:          ${JSON.stringify(r2.recorded)}`);
  console.log(`  superseded:        ${JSON.stringify(r2.superseded)}`);
  console.log(`  skippedDuplicates: ${JSON.stringify(r2.skippedDuplicates)}`);
  console.log(`  watermark:         ${r2.watermark}`);
  poller2.shutdown();

  // 5. Final state + operation history.
  const finalDoc = await reactor.get<FeedLedgerDocument>(documentId);
  console.log("\n─── Final ledger state ───\n");
  printLedger(finalDoc);

  const ops = await reactor.getOperations(documentId);
  const domain = (ops.global?.results ?? []).filter((op) =>
    ["RECORD_ENTRY", "MARK_SUPERSEDED"].includes(op.action.type),
  );
  console.log("\n─── Operation history ───\n");
  for (const op of domain) {
    const input = op.action.input as { externalId?: string };
    console.log(`  ${op.action.type.padEnd(16)} ${input.externalId ?? ""}`);
  }

  // 6. Prove the invariants the recipe is about.
  const entries = finalDoc.state.global.entries;
  const ids = entries.map((e) => e.externalId);
  const noDuplicates = new Set(ids).size === ids.length;
  const po002Count = ids.filter((id) => id === "po-002").length;
  const correction = entries.find((e) => e.externalId === "po-001-c");
  const original = entries.find((e) => e.externalId === "po-001");
  const correctionModeled =
    original?.status === "SUPERSEDED" &&
    original.supersededBy === "po-001-c" &&
    correction?.payload.includes("restated") === true;

  console.log("\n─── Checks ───\n");
  console.log(
    `  ${noDuplicates ? "✓" : "✗"} no duplicate entries across the restart (po-002 appears ${po002Count}×)`,
  );
  console.log(
    `  ${correctionModeled ? "✓" : "✗"} correction modeled as MARK_SUPERSEDED + new entry, original payload intact`,
  );
  console.log(
    `  ${original?.payload === "Invoice #001 — $100" ? "✓" : "✗"} original po-001 payload was never mutated`,
  );

  // 7. Cleanup.
  jobAwaiter.shutdown();
  reactor.kill();
  process.exit(noDuplicates && correctionModeled ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
