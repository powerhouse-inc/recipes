/**
 * drive-override demo.
 *
 * Builds a custom container document and wires 10,000 child documents to it
 * via ADD_RELATIONSHIP. The container's own state stays at O(1) — children
 * live in the reactor's DocumentRelationship table and are enumerated via
 * paged, DB-native queries.
 */
import {
  ReactorBuilder,
  JobAwaiter,
  addRelationshipAction,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import type { PHDocument } from "document-model";
import {
  CustomContainer,
  createCustomContainerDocument,
  customContainerDocumentType,
  actions as containerActions,
  type CustomContainerPHState,
} from "document-models/custom-container/v1";

const TOTAL_CHILDREN = 10_000;
const BATCH_SIZE = 100;
const PAGE_SIZE = 500;
const RELATIONSHIP_TYPE = "contains";

const makeChildDocument = () =>
  documentModelDocumentModelModule.utils.createDocument();

async function main() {
  console.log("drive-override demo");
  console.log("===================\n");

  // 1. Build the reactor. Note: NO driveDocumentModelModule — we are
  //    deliberately not using document-drive as our container.
  process.stdout.write("Starting reactor... ");
  const t0 = performance.now();
  const { reactor, eventBus, documentIndexer } = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule,
      CustomContainer,
    ])
    .buildModule();
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
  console.log(`done (${((performance.now() - t0) / 1000).toFixed(2)}s)\n`);

  // 2. Create the custom container and apply SET_METADATA.
  const container = createCustomContainerDocument();
  const containerId = container.header.id;
  const createJob = await reactor.create(container);
  await jobAwaiter.waitForJob(createJob.id);
  console.log(`Created container ${containerId} (${customContainerDocumentType})`);

  const metaJob = await reactor.execute(containerId, "main", [
    containerActions.setMetadata({
      name: "Library",
      description: `Stress test with ${TOTAL_CHILDREN.toLocaleString()} children`,
    }),
  ]);
  await jobAwaiter.waitForJob(metaJob.id);
  console.log("Applied SET_METADATA\n");

  // 3. Bulk-create children + wire each to the container in batches.
  //    Each batch: create N child docs in parallel, then issue N
  //    ADD_RELATIONSHIP actions in parallel against the container.
  console.log(
    `Creating ${TOTAL_CHILDREN.toLocaleString()} children in batches of ${BATCH_SIZE}...`,
  );
  const startBulk = performance.now();
  const batches = Math.ceil(TOTAL_CHILDREN / BATCH_SIZE);
  const childIds: string[] = [];
  let lastConsistencyToken = metaJob.consistencyToken;

  for (let b = 0; b < batches; b++) {
    const batchStart = performance.now();
    const batchSize = Math.min(BATCH_SIZE, TOTAL_CHILDREN - b * BATCH_SIZE);

    const childDocs = Array.from({ length: batchSize }, makeChildDocument);
    const createInfos = await Promise.all(
      childDocs.map((doc) => reactor.create(doc)),
    );
    await Promise.all(createInfos.map((info) => jobAwaiter.waitForJob(info.id)));

    const relInfos = await Promise.all(
      childDocs.map((doc) =>
        reactor.execute(containerId, "main", [
          addRelationshipAction(containerId, doc.header.id, RELATIONSHIP_TYPE),
        ]),
      ),
    );
    const relCompleted = await Promise.all(
      relInfos.map((info) => jobAwaiter.waitForJob(info.id)),
    );
    lastConsistencyToken = relCompleted[relCompleted.length - 1].consistencyToken;

    for (const doc of childDocs) childIds.push(doc.header.id);

    const elapsed = performance.now() - batchStart;
    process.stdout.write(
      `  batch ${b + 1}/${batches} (${batchSize} children) done in ${elapsed.toFixed(0)}ms\r`,
    );
  }
  const bulkElapsed = ((performance.now() - startBulk) / 1000).toFixed(2);
  process.stdout.write("\n");
  console.log(
    `Wired ${childIds.length.toLocaleString()} children in ${bulkElapsed}s\n`,
  );

  // 4. Confirm container state has not grown.
  const containerDoc =
    await reactor.get<PHDocument<CustomContainerPHState>>(containerId);
  const globalKeys = Object.keys(containerDoc.state.global).sort();
  const hasChildrenArray = globalKeys.some((k) =>
    ["children", "nodes", "files"].includes(k),
  );
  console.log("Container state.global keys:", globalKeys);
  console.log(
    `Container state is O(1): ${!hasChildrenArray ? "yes" : "NO — state grew"}\n`,
  );

  // 5. Wait for the indexer to catch up to the last write, then page through
  //    all children via the DB-native indexer.
  await documentIndexer.waitForConsistency(lastConsistencyToken);

  console.log(`Paging children via documentIndexer.getOutgoing (page size ${PAGE_SIZE})...`);
  const startPage = performance.now();
  let cursor = "0";
  let total = 0;
  let pages = 0;
  while (true) {
    const page = await documentIndexer.getOutgoing(
      containerId,
      [RELATIONSHIP_TYPE],
      { cursor, limit: PAGE_SIZE },
      lastConsistencyToken,
    );
    pages++;
    total += page.results.length;
    if (!page.nextCursor || page.results.length === 0) break;
    cursor = page.nextCursor;
  }
  const pageElapsed = ((performance.now() - startPage) / 1000).toFixed(2);
  console.log(
    `Enumerated ${total.toLocaleString()} children across ${pages} page(s) in ${pageElapsed}s\n`,
  );

  // 6. Reverse direction: confirm getIncoming returns the container as the
  //    parent of a sampled child.
  const sampleChildId = childIds[Math.floor(childIds.length / 2)];
  const incoming = await documentIndexer.getIncoming(
    sampleChildId,
    [RELATIONSHIP_TYPE],
    { cursor: "0", limit: 10 },
    lastConsistencyToken,
  );
  const incomingParentIds = incoming.results.map((r) => r.sourceId);
  console.log(`Sampled child ${sampleChildId}`);
  console.log(`  getIncoming sources: ${JSON.stringify(incomingParentIds)}`);
  console.log(
    `  contains containerId: ${incomingParentIds.includes(containerId) ? "yes" : "NO"}\n`,
  );

  console.log("GraphQL note:");
  console.log(
    "  The reactor subgraph exposes the same data via the fields",
  );
  console.log(
    "  `documentOutgoingRelationships` and `documentIncomingRelationships`,",
  );
  console.log(
    "  both paged. Use them when querying from an external client.\n",
  );

  // 7. Cleanup.
  jobAwaiter.shutdown();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
