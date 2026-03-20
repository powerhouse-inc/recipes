import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { IReactorClient } from "@powerhousedao/reactor";
import { driveCreateDocument, addFile } from "document-drive";
import { documentModelCreateDocument } from "document-model";

/**
 * Exports document snapshots using the high-level IReactorClient API.
 *
 * IReactorClient wraps IReactor with several conveniences:
 *   - Mutations return the document directly (not a JobInfo)
 *   - Job awaiting is handled internally — no need for JobAwaiter
 *   - Consistency tokens are managed behind the scenes
 *   - Actions are automatically signed via the configured signer
 *   - Subscriptions are wrapped with ViewFilters
 *
 * The trade-off is less control: you can't access the raw JobInfo,
 * inspect consistency tokens, or fine-tune when to wait for read
 * readiness vs write readiness.
 */
export async function exportWithClient(
  client: IReactorClient,
  outDir: string,
) {
  mkdirSync(outDir, { recursive: true });

  // --- 1. Create drive ---
  // client.create() awaits the job and returns the document directly.
  // No consistency token needed — the client waits for READ_READY.
  console.log("  Creating drive...");
  const driveDoc = driveCreateDocument();
  const driveId = driveDoc.header.id;
  await client.create(driveDoc);

  // --- 2. Create two document-model documents ---
  // client.create() returns the created document directly — no JobInfo,
  // no manual await, no consistency token.
  console.log("  Creating documents...");
  const docIds: string[] = [];

  for (let i = 0; i < 2; i++) {
    const doc = documentModelCreateDocument();
    await client.create(doc);
    docIds.push(doc.header.id);
  }

  // --- 3. Register documents in the drive ---
  // client.execute() applies actions, awaits the job, and returns the
  // updated document. Signing is automatic if a signer was configured.
  console.log("  Registering documents in drive...");
  for (let i = 0; i < docIds.length; i++) {
    await client.execute(driveId, "main", [
      addFile({
        id: docIds[i],
        name: `Document-${i + 1}`,
        documentType: "powerhouse/document-model",
      }),
    ]);
  }

  // --- 4. Export each document ---
  // client.get() has no consistency token parameter — the client
  // already ensured consistency by waiting for the prior write jobs.
  console.log("  Exporting snapshots...");
  for (let i = 0; i < docIds.length; i++) {
    const doc = await client.get(docIds[i]);

    // client.getOperations() returns a flat PagedResults<Operation>
    // (not a per-scope map like IReactor.getOperations)
    const opsResult = await client.getOperations(docIds[i]);

    const snapshot = {
      header: doc.header,
      state: doc.state,
      operations: opsResult.results,
      exportedAt: new Date().toISOString(),
      mode: "client",
    };

    const filePath = join(outDir, `${docIds[i]}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    console.log(`    ${filePath}`);
  }

  // --- 5. Export the drive ---
  const drive = await client.get(driveId);
  const driveOps = await client.getOperations(driveId);

  const driveSnapshot = {
    header: drive.header,
    state: drive.state,
    operations: driveOps.results,
    exportedAt: new Date().toISOString(),
    mode: "client",
  };

  const driveFilePath = join(outDir, `${driveId}.json`);
  writeFileSync(driveFilePath, JSON.stringify(driveSnapshot, null, 2));
  console.log(`    ${driveFilePath}`);

  return { driveId, docIds };
}
