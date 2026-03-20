import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  JobAwaiter,
  type IReactor,
  type IEventBus,
  type ConsistencyToken,
  type OperationFilter,
} from "@powerhousedao/reactor";
import { documentModelCreateDocument } from "document-model";
import { driveCreateDocument, addFile } from "document-drive";

/**
 * Exports document snapshots using the low-level IReactor API.
 *
 * IReactor is the core reactor interface. Every mutation returns a JobInfo
 * object with a consistency token — you must await the job yourself and
 * pass the token to subsequent reads to guarantee read-after-write
 * consistency. This is the key difference from IReactorClient, which
 * handles job awaiting and consistency internally.
 */
export async function exportWithReactor(
  reactor: IReactor,
  eventBus: IEventBus,
  outDir: string,
) {
  mkdirSync(outDir, { recursive: true });

  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // --- 1. Create drive ---
  // reactor.create() returns a JobInfo — not the document itself.
  // We must wait for the job to reach a terminal state before reading.
  console.log("  Creating drive...");
  const driveDoc = driveCreateDocument();
  const driveId = driveDoc.header.id;
  const driveJob = await reactor.create(driveDoc);
  const driveCompleted = await jobAwaiter.waitForJob(driveJob.id);

  // The consistency token captures the exact write position (document,
  // scope, branch, operation index) so reads can wait for read models
  // to catch up to at least this point.
  const driveToken: ConsistencyToken = driveCompleted.consistencyToken;

  // --- 2. Create two document-model documents ---
  // documentModelCreateDocument() generates a fresh PHDocument with a
  // random id. We pass it to reactor.create() and read the id from the header.
  console.log("  Creating documents...");
  const docIds: string[] = [];
  const docTokens: ConsistencyToken[] = [];

  for (let i = 0; i < 2; i++) {
    const doc = documentModelCreateDocument();
    const job = await reactor.create(doc);
    const completed = await jobAwaiter.waitForJob(job.id);
    docIds.push(doc.header.id);
    docTokens.push(completed.consistencyToken);
  }

  // --- 3. Register documents in the drive ---
  // We execute addFile actions against the drive document.
  console.log("  Registering documents in drive...");
  for (let i = 0; i < docIds.length; i++) {
    const job = await reactor.execute(driveId, "main", [
      addFile({
        id: docIds[i],
        name: `Document-${i + 1}`,
        documentType: "powerhouse/document-model",
      }),
    ]);
    const completed = await jobAwaiter.waitForJob(job.id);
    // Update the drive token to the latest write position
    docTokens[i] = completed.consistencyToken;
  }

  // --- 4. Export each document with read-after-write consistency ---
  // By passing the consistency token from the write job to reactor.get(),
  // we guarantee that the read reflects the write — even if background
  // indexing is still in progress.
  console.log("  Exporting snapshots...");
  for (let i = 0; i < docIds.length; i++) {
    const token = docTokens[i];

    // Fetch document state — the token ensures we see post-write state
    const doc = await reactor.get(docIds[i], undefined, token);

    // Fetch operations with filters. OperationFilter supports:
    //   actionTypes?: string[]       — filter by action type (OR logic)
    //   timestampFrom?: string       — ops with timestamp >= value (ISO)
    //   timestampTo?: string         — ops with timestamp <= value (ISO)
    //   sinceRevision?: number       — ops with index >= value
    const filter: OperationFilter = {};
    const opsResult = await reactor.getOperations(
      docIds[i],
      undefined, // ViewFilter (branch/scopes) — default is fine
      filter,
      undefined, // PagingOptions — fetch all
      token,
    );

    // Flatten the scoped operations map into a single array
    const operations = Object.entries(opsResult).flatMap(
      ([scope, paged]) =>
        paged.results.map((op) => ({ ...op, scope })),
    );

    const snapshot = {
      header: doc.header,
      state: doc.state,
      operations,
      exportedAt: new Date().toISOString(),
      mode: "reactor",
    };

    const filePath = join(outDir, `${docIds[i]}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    console.log(`    ${filePath}`);
  }

  // --- 5. Export the drive itself ---
  const latestDriveToken = docTokens[docTokens.length - 1];
  const drive = await reactor.get(driveId, undefined, latestDriveToken);
  const driveOps = await reactor.getOperations(
    driveId,
    undefined,
    {},
    undefined,
    latestDriveToken,
  );
  const driveOperations = Object.entries(driveOps).flatMap(
    ([scope, paged]) =>
      paged.results.map((op) => ({ ...op, scope })),
  );

  const driveSnapshot = {
    header: drive.header,
    state: drive.state,
    operations: driveOperations,
    exportedAt: new Date().toISOString(),
    mode: "reactor",
  };

  const driveFilePath = join(outDir, `${driveId}.json`);
  writeFileSync(driveFilePath, JSON.stringify(driveSnapshot, null, 2));
  console.log(`    ${driveFilePath}`);

  jobAwaiter.shutdown();
  return { driveId, docIds };
}
