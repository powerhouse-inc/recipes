import {
  ReactorBuilder,
  SyncBuilder,
  JobAwaiter,
  driveCollectionId,
  type IReactor,
  type IEventBus,
  type ReactorModule,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";

import { SyncHealthMonitor } from "./health-monitor.js";
import {
  createInternalChannelFactory,
  type InternalChannel,
} from "./internal-channel.js";
import { startHealthServer } from "./health-subgraph.js";
import { startDashboard } from "./dashboard.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const GRAPHQL_PORT = 4001;

const docModels = [documentModelDocumentModelModule, driveDocumentModelModule];

async function main() {
  const jsonMode = process.argv.includes("--json");

  // ------------------------------------------------------------------
  // 1. Build two embedded reactors with a shared internal channel bridge
  // ------------------------------------------------------------------
  process.stdout.write("Starting reactors...");
  const t0 = performance.now();

  const channelRegistry = new Map<string, InternalChannel>();
  const peerMapping = new Map([
    ["remoteB", "remoteA"],
    ["remoteA", "remoteB"],
  ]);
  const channelFactory = createInternalChannelFactory(
    channelRegistry,
    peerMapping,
  );

  const [moduleA, moduleB] = await Promise.all([
    new ReactorBuilder()
      .withDocumentModels(docModels)
      .withSync(new SyncBuilder().withChannelFactory(channelFactory))
      .buildModule(),
    new ReactorBuilder()
      .withDocumentModels(docModels)
      .withSync(new SyncBuilder().withChannelFactory(channelFactory))
      .buildModule(),
  ]);

  const reactorA: IReactor = moduleA.reactor;
  const eventBusA: IEventBus = moduleA.eventBus;

  const jobAwaiter = new JobAwaiter(eventBusA, (jobId, signal) =>
    reactorA.getJobStatus(jobId, signal),
  );

  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  // ------------------------------------------------------------------
  // 2. Attach health monitor to reactor A's EventBus
  // ------------------------------------------------------------------
  const monitor = new SyncHealthMonitor(eventBusA);

  // ------------------------------------------------------------------
  // 3. Start GraphQL subgraph server
  // ------------------------------------------------------------------
  const server = startHealthServer(monitor, GRAPHQL_PORT);

  // ------------------------------------------------------------------
  // 4. Create a drive on reactor A — we need its ID for the collection
  // ------------------------------------------------------------------
  const driveDoc = driveCreateDocument();
  const driveId = driveDoc.header.id;
  const driveJob = await reactorA.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);

  const jobAwaiterB = new JobAwaiter(moduleB.eventBus, (jobId, signal) =>
    moduleB.reactor.getJobStatus(jobId, signal),
  );

  // ------------------------------------------------------------------
  // 5. Wire remotes: A ↔ B for this drive's collection
  // ------------------------------------------------------------------
  const collectionId = driveCollectionId("main", driveId);
  const filter = { documentId: [], scope: [], branch: "main" };

  await moduleA.syncModule!.syncManager.add("remoteB", collectionId, {
    type: "internal",
    parameters: {},
  }, filter);

  await moduleB.syncModule!.syncManager.add("remoteA", collectionId, {
    type: "internal",
    parameters: {},
  }, filter);

  // ------------------------------------------------------------------
  // 6. Start the live dashboard
  // ------------------------------------------------------------------
  const stopDashboard = startDashboard(monitor, 2000, jsonMode);

  // ------------------------------------------------------------------
  // 7. Generate sync traffic in phases
  // ------------------------------------------------------------------
  await runDemo(moduleA, moduleB, reactorA, jobAwaiter, channelRegistry);

  // ------------------------------------------------------------------
  // 8. Keep dashboard running until Ctrl+C
  // ------------------------------------------------------------------
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    stopDashboard();
    monitor.shutdown();
    jobAwaiter.shutdown();
    jobAwaiterB.shutdown();
    server.close();
    reactorA.kill();
    moduleB.reactor.kill();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Demo scenario: normal sync → connection issue → failure → recovery
// ---------------------------------------------------------------------------

async function runDemo(
  moduleA: ReactorModule,
  _moduleB: ReactorModule,
  reactor: IReactor,
  jobAwaiter: JobAwaiter,
  channelRegistry: Map<string, InternalChannel>,
) {
  // Phase 1 — Normal sync: create a document model document
  await sleep(3000);
  const docA = await import("document-model").then((m) =>
    m.documentModelCreateDocument(),
  );
  const job1 = await reactor.create(docA);
  await jobAwaiter.waitForJob(job1.id);
  // Dashboard should show: successCount +1

  // Phase 2 — Simulate connection state changes
  await sleep(3000);
  const channelToB = channelRegistry.get("remoteB");
  if (channelToB) {
    channelToB.simulateStateChange("disconnected");
    await sleep(3000);
    channelToB.simulateStateChange("reconnecting");
    await sleep(2000);
    channelToB.simulateStateChange("connected");
  }

  // Phase 3 — Simulate sync failure by making the channel throw
  await sleep(3000);
  const originalSend = channelToB
    ? channelToB.getSendFn()
    : () => {};
  if (channelToB) {
    channelToB.setSendFn(() => {
      throw new Error("simulated network failure");
    });
  }

  const docB = await import("document-model").then((m) =>
    m.documentModelCreateDocument(),
  );
  try {
    const job2 = await reactor.create(docB);
    await jobAwaiter.waitForJob(job2.id);
  } catch {
    // expected — sync may fail but job itself succeeds locally
  }
  // Dashboard should show: failureCount +1, deadLetterCount +1

  // Phase 4 — Recovery: restore the channel, create another document
  await sleep(3000);
  if (channelToB) {
    channelToB.setSendFn(originalSend);
  }

  const docC = await import("document-model").then((m) =>
    m.documentModelCreateDocument(),
  );
  const job3 = await reactor.create(docC);
  await jobAwaiter.waitForJob(job3.id);
  // Dashboard should show: successCount +1
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
