import {
  ReactorBuilder,
  ReactorEventTypes,
  JobAwaiter,
  type JobReadReadyEvent,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import {
  driveDocumentModelModule,
  driveCreateDocument,
} from "document-drive";
import { DocumentCountReadModel } from "./document-count-read-model.js";

/**
 * Demonstrates a custom IReadModel registered via ReactorBuilder.withReadModel().
 *
 * Key concepts shown:
 *
 * 1. **IReadModel contract** — implement indexOperations() to receive every
 *    operation written to the reactor's operation store.
 *
 * 2. **Pre-ready phase** — read models registered with withReadModel() are
 *    added to the ReadModelCoordinator's preReady list. They complete
 *    *before* JOB_READ_READY fires, so the materialized view is consistent
 *    by the time downstream subscribers see the event.
 *
 * 3. **Read model vs processor** — processors (IProcessor) are post-ready:
 *    they run *after* JOB_READ_READY, suitable for side-effects. Read models
 *    are for derived views that must be queryable immediately.
 *
 * 4. **buildModule() internals** — gives direct access to the ReactorModule
 *    (eventBus, database, operationStore, etc.) for advanced integration.
 */
async function main() {
  console.log("Custom Read Model — Document Count Per Type");
  console.log("════════════════════════════════════════════\n");

  // 1. Create the custom read model instance
  const countReadModel = new DocumentCountReadModel();

  // 2. Build reactor, registering the read model via withReadModel().
  //    This places it in the preReady list inside ReadModelCoordinator.
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ])
    .withReadModel(countReadModel)
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  const { reactor, eventBus } = reactorModule;
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 3. Subscribe to JOB_READ_READY to verify the read model has already
  //    processed by the time this event fires (pre-ready guarantee).
  const unsubscribe = eventBus.subscribe(
    ReactorEventTypes.JOB_READ_READY,
    (_type: number, event: JobReadReadyEvent) => {
      console.log(`  [JOB_READ_READY] job=${event.jobId}`);
      console.log(`    Read model counts (already updated):`);
      for (const [type, count] of countReadModel.getCounts()) {
        console.log(`      ${type}: ${count} operations`);
      }
    },
  );

  // 4. Create a drive document — this triggers the full job lifecycle:
  //    JOB_PENDING → JOB_RUNNING → JOB_WRITE_READY → (preReady read models) → JOB_READ_READY → (postReady processors)
  console.log("Creating drive document...");
  const driveDoc = driveCreateDocument();
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(`  Drive created: ${driveDoc.header.id}\n`);

  // 5. Show final state of the materialized view
  console.log("Final materialized view:");
  for (const [type, count] of countReadModel.getCounts()) {
    console.log(`  ${type}: ${count} operations`);
  }

  // 6. Cleanup
  unsubscribe();
  jobAwaiter.shutdown();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
