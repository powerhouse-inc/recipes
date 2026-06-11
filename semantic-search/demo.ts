import { sql, Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { vector } from "@electric-sql/pglite/vector";
import { ReactorBuilder, JobAwaiter } from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
  setName,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "@powerhousedao/shared/document-drive";
import type { SemanticSearchDB } from "./schema.js";
import { up } from "./migrations.js";
import { SemanticSearchProcessor } from "./processor.js";
import { createSimilarityQuery } from "./query.js";
import { embed } from "./embedder.js";

/**
 * Lexical comparison: the same content searched with PostgreSQL full-text
 * search (the approach of the full-text-search recipe). Shows what keyword
 * matching misses when query and document share meaning but not words.
 */
async function lexicalSearch(
  db: Kysely<SemanticSearchDB>,
  term: string,
): Promise<{ title: string }[]> {
  const result = await sql<{ title: string }>`
    SELECT title
    FROM semantic_index
    WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${term})
  `.execute(db);
  return result.rows;
}

async function main() {
  console.log("Semantic Search Demo");
  console.log("════════════════════\n");

  // 1. Set up PGlite (with the pgvector extension) + Kysely
  const pglite = new KyselyPGlite({ extensions: { vector } });
  const db = new Kysely<SemanticSearchDB>({ dialect: pglite.dialect });
  await up(db);
  console.log("Semantic index schema created (vector(384) + HNSW)");

  // 2. Load the embedding model (first run downloads ~25 MB to .model-cache/)
  process.stdout.write("Loading embedding model...");
  const tModel = performance.now();
  await embed("warm up");
  console.log(` done (${((performance.now() - tModel) / 1000).toFixed(1)}s)`);

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

  // 4. Register the semantic-search processor
  const processor = new SemanticSearchProcessor(db, embed);
  await processorManager.registerFactory("semantic-search", () => [
    {
      processor,
      filter: { branch: ["main"] },
      startFrom: "beginning" as const,
    },
  ]);
  console.log("Registered semantic-search processor");

  // 5. Create a drive
  process.stdout.write("\nCreating drive...");
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(` ${driveDoc.header.id}`);

  // 6. Create documents on distinct topics
  const docNames = [
    "Automobile Maintenance and Repair Manual",
    "Vehicle Insurance Policy Terms",
    "Quarterly Budget and Financial Forecast",
    "Invoice Payment Processing Rules",
    "Pasta Recipes from Northern Italy",
    "Guide to Baking Sourdough Bread",
    "Mountain Hiking Trail Maps",
    "Marathon Training Program for Beginners",
    "Introduction to Neural Networks",
    "Database Index Tuning Handbook",
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

  // 7. Wait for the processor to embed everything (drive + documents)
  process.stdout.write("\nWaiting for embeddings...");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { count } = await db
      .selectFrom("semantic_index")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    if (Number(count) >= docNames.length) break;
    await new Promise<void>((r) => setTimeout(r, 250));
  }
  const rows = await db.selectFrom("semantic_index").selectAll().execute();
  console.log(` ${rows.length} documents embedded`);

  // 8. Semantic queries — none of these share keywords with their best hits
  const query = createSimilarityQuery(db, embed);

  for (const text of [
    "my car needs an oil change",
    "what should I cook for dinner tonight",
    "training machine learning models",
  ]) {
    const results = await query.searchSimilar(text, 3);
    console.log(`\nSemantic search: "${text}"`);
    for (const r of results) {
      console.log(`  ${r.similarity.toFixed(3)}  "${r.title || "(untitled)"}"`);
    }

    // Side-by-side: what lexical full-text search finds for the same query
    const lexical = await lexicalSearch(db, text);
    console.log(
      `  (lexical full-text search: ${
        lexical.length === 0
          ? "no results"
          : lexical.map((l) => `"${l.title}"`).join(", ")
      })`,
    );
  }

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
