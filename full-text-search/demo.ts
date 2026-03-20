import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import {
  ReactorBuilder,
  JobAwaiter,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
  setName,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import type { SearchDB } from "./schema.js";
import { up } from "./migrations.js";
import { SearchProcessor } from "./processor.js";
import { createSearchQuery } from "./query.js";

async function main() {
  console.log("Full-Text Search Demo");
  console.log("═════════════════════\n");

  // 1. Set up PGlite + Kysely for the search index
  const pglite = new KyselyPGlite();
  const db = new Kysely<SearchDB>({ dialect: pglite.dialect });
  await up(db);
  console.log("Search index schema created");

  // 2. Build reactor
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

  // 3. Register search processor
  const processor = new SearchProcessor(db);
  await processorManager.registerFactory("full-text-search", () => [
    {
      processor,
      filter: { branch: ["main"] },
      startFrom: "beginning" as const,
    },
  ]);
  console.log("Registered full-text-search processor");

  // 4. Create a drive
  process.stdout.write("\nCreating drive...");
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(` ${driveDoc.header.id}`);

  // 5. Create some documents and give them distinct names
  const docNames = [
    "Quarterly Budget Report",
    "Engineering Sprint Plan",
    "Design System Guide",
  ];
  console.log("\nCreating documents...");
  for (const name of docNames) {
    const doc = documentModelCreateDocument();
    const createJob = await reactor.create(doc);
    await jobAwaiter.waitForJob(createJob.id);
    const nameJob = await reactor.execute(doc.header.id, "main", [
      setName(name),
    ]);
    await jobAwaiter.waitForJob(nameJob.id);
    console.log(`  ${doc.header.id} — "${name}"`);
  }

  // 6. Wait for processor to index
  await new Promise<void>((r) => setTimeout(r, 1000));

  // 7. Show indexed documents
  const rows = await db.selectFrom("search_index").selectAll().execute();
  console.log(`\nIndexed documents: ${rows.length}`);
  for (const row of rows) {
    console.log(`  ${row.document_id} (${row.document_type}) — "${row.title || "(untitled)"}"`);
  }

  // 8. Search demos — show selective matching
  const query = createSearchQuery(db);

  for (const searchTerm of ["budget", "guide", "sprint"]) {
    const results = await query.search(searchTerm);
    console.log(`\nSearch for "${searchTerm}": ${results.length} result(s)`);
    for (const r of results) {
      console.log(`  ${r.document_id} — "${r.title}" (rank=${r.rank.toFixed(4)})`);
    }
  }

  // Broader search that matches nothing
  const noResults = await query.search("kubernetes");
  console.log(`\nSearch for "kubernetes": ${noResults.length} result(s)`);

  console.log("\n✓ Demo complete");

  // 9. Cleanup
  jobAwaiter.shutdown();
  await db.destroy();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
