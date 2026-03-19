import {
  ReactorBuilder,
  ReactorEventTypes,
  JobStatus,
  JobAwaiter,
  type IReactor,
  type IEventBus,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import { MultiBar, type SingleBar } from "cli-progress";
import {
  buildCreateProjectBatch,
  JOB_KEYS,
  type JobKey,
} from "./create-project.js";

// --- Status progression (forward-only) ---
const STATUS_VALUE: Record<string, number> = {
  [JobStatus.PENDING]: 0,
  [JobStatus.RUNNING]: 1,
  [JobStatus.WRITE_READY]: 2,
  [JobStatus.READ_READY]: 3,
  [JobStatus.FAILED]: 3,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --- Main ---
async function main() {
  console.log("Multi-Document Wizard — Create Project");
  console.log("═══════════════════════════════════════\n");

  // 1. Build embedded reactor with in-memory PGlite
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModels([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ])
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  const reactor: IReactor = reactorModule.reactor;
  const eventBus: IEventBus = reactorModule.eventBus;
  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 2. Record batch events for replay — all events fire synchronously
  //    during executeBatch, so we capture them and replay with visual delays
  const eventLog: Array<{ jobId: string; status: JobStatus }> = [];
  const highWater = new Map<string, number>();

  function record(status: JobStatus) {
    return (_type: number, event: { jobId: string }) => {
      const cur = highWater.get(event.jobId) ?? -1;
      const next = STATUS_VALUE[status] ?? 0;
      if (next <= cur) return;
      highWater.set(event.jobId, next);
      eventLog.push({ jobId: event.jobId, status });
    };
  }

  const unsubscribes: Unsubscribe[] = [
    eventBus.subscribe(ReactorEventTypes.JOB_PENDING, record(JobStatus.PENDING)),
    eventBus.subscribe(ReactorEventTypes.JOB_RUNNING, record(JobStatus.RUNNING)),
    eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      record(JobStatus.WRITE_READY),
    ),
    eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      record(JobStatus.READ_READY),
    ),
    eventBus.subscribe(ReactorEventTypes.JOB_FAILED, record(JobStatus.FAILED)),
  ];

  // 3. Create drive
  process.stdout.write("Creating drive...");
  const driveDoc = driveCreateDocument();
  const driveId = driveDoc.header.id;
  const driveJob = await reactor.create(driveDoc);
  await jobAwaiter.waitForJob(driveJob.id);
  console.log(` ${driveId}\n`);

  // Reset event log (clear drive events)
  eventLog.length = 0;
  highWater.clear();

  // 4. Build and execute batch
  const { request, ids } = buildCreateProjectBatch(driveId);
  const startTime = performance.now();
  const result = await reactor.executeBatch(request);

  // 5. Build jobId → key mapping
  const jobIdToKey = new Map<string, string>();
  for (const [key, info] of Object.entries(result.jobs)) {
    jobIdToKey.set(info.id, key);
  }

  // 6. Set up progress bars
  const multibar = new MultiBar({
    format: "  {label} |{bar}| {status}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
    clearOnComplete: false,
    stopOnComplete: false,
    noTTYOutput: true,
  });

  const bars = new Map<JobKey, SingleBar>();
  for (const key of JOB_KEYS) {
    bars.set(
      key,
      multibar.create(3, 0, { label: key.padEnd(7), status: "PENDING" }),
    );
  }

  // Force initial render showing all bars at PENDING
  multibar.update();
  await sleep(400);

  // 7. Replay recorded events with visual delays.
  //    The for-of iterator picks up new events pushed during sleep()
  //    (e.g. async completions that fire after executeBatch returned).
  for (const { jobId, status } of eventLog) {
    if (status === JobStatus.PENDING) continue;
    const key = jobIdToKey.get(jobId);
    if (!key) continue;
    const bar = bars.get(key as JobKey);
    if (bar) bar.update(STATUS_VALUE[status] ?? 0, { status });
    multibar.update();
    await sleep(150);
  }

  // 8. Ensure all jobs reach terminal state (handles any events
  //    that weren't captured during executeBatch)
  const finalStatuses = new Map<string, JobStatus>();
  await Promise.all(
    Object.entries(result.jobs).map(async ([key, info]) => {
      const completed = await jobAwaiter.waitForJob(info.id);
      finalStatuses.set(key, completed.status);
      const bar = bars.get(key as JobKey);
      if (bar)
        bar.update(STATUS_VALUE[completed.status] ?? 0, {
          status: completed.status,
        });
    }),
  );
  multibar.stop();

  // 9. Summary
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  const failed = [...finalStatuses.values()].filter(
    (s) => s === JobStatus.FAILED,
  ).length;
  const succeeded = JOB_KEYS.length - failed;

  console.log(
    `\n${failed === 0 ? "\u2713" : "\u2717"} Done in ${elapsed}s — ${succeeded} jobs completed, ${failed} failed`,
  );
  console.log(`  Budget:  ${ids.budgetId}`);
  console.log(`  Scope:   ${ids.scopeId}`);
  console.log(`  Project: ${ids.projectId}`);
  console.log(`  Drive:   ${driveId}`);

  // 10. Cleanup
  unsubscribes.forEach((unsub) => unsub());
  jobAwaiter.shutdown();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
