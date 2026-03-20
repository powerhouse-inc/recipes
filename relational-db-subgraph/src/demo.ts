import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import {
  ReactorBuilder,
  JobAwaiter,
  createRelationalDb,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import type { CatalogDB } from "./schema.js";
import { CatalogProcessor } from "./processor.js";
import { createCatalogQuery } from "./query.js";

async function main() {
  console.log("Relational DB Subgraph Demo");
  console.log("═══════════════════════════\n");

  // 1. Set up PGlite + Kysely for catalog
  const pglite = new KyselyPGlite();
  const db = new Kysely<CatalogDB>({ dialect: pglite.dialect });
  const relationalDb = createRelationalDb<CatalogDB>(db);
  console.log("Catalog database created");

  // 2. Create and initialize processor
  const filter = { branch: ["main"] as string[] };
  const processor = new CatalogProcessor("catalog", filter, relationalDb);
  await processor.initAndUpgrade();
  console.log("Catalog processor initialized (migrations applied)");

  // 3. Build reactor
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ])
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  const { reactor, eventBus, processorManager } = reactorModule;
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 4. Register processor
  await processorManager.registerFactory("catalog", () => [
    {
      processor,
      filter,
      startFrom: "beginning" as const,
    },
  ]);
  console.log("Registered catalog processor");

  // 5. Create a drive and some documents
  process.stdout.write("\nCreating drive...");
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(` ${driveDoc.header.id}`);

  console.log("Creating documents...");
  for (let i = 0; i < 3; i++) {
    const doc = documentModelCreateDocument();
    const job = await reactor.create(doc);
    await jobAwaiter.waitForJob(job.id);
    console.log(`  Document ${i + 1}: ${doc.header.id}`);
  }

  // 6. Wait for processor
  await new Promise<void>((r) => setTimeout(r, 1000));

  // 7. Query catalog
  const query = createCatalogQuery(db);
  const docs = await query.allDocuments();
  console.log(`\nCatalog entries: ${docs.length}`);
  for (const doc of docs) {
    console.log(`  ${doc.document_id} (${doc.document_type}) — "${doc.name || "(unnamed)"}" rev=${doc.revision} tags=[${doc.tags.join(", ")}]`);
  }

  if (docs.length === 0) {
    console.log("  (no entries — processor may not have received operations with resultingState)");
  }

  console.log("\n✓ Demo complete");

  // 8. Cleanup
  jobAwaiter.shutdown();
  await db.destroy();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
