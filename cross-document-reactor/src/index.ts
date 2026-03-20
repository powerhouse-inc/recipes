import {
  ReactorBuilder,
  ReactorClientBuilder,
  DocumentChangeType,
  type IReactorClient,
  type DocumentChangeEvent,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(msg: string) {
  console.log(`  [${ts()}] ${msg}`);
}

async function main() {
  console.log("Cross-Document Reactor");
  console.log("══════════════════════\n");
  console.log(
    "Demonstrates: subscriptions, cross-document workflows, execute()",
  );
  console.log("from within a subscription handler.\n");

  // 1. Build ReactorClient with embedded reactor
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();

  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModels([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ]),
    )
    .buildModule();

  const client: IReactorClient = clientModule.client;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  // 2. Create a drive and two documents (invoice + task)
  process.stdout.write("Creating drive...");
  const drive = await client.create(driveCreateDocument());
  const driveId = drive.header.id;
  console.log(` ${driveId}`);

  process.stdout.write("Creating invoice document...");
  const invoice = await client.createDocumentInDrive(
    driveId,
    documentModelCreateDocument(),
  );
  const invoiceId = invoice.header.id;
  console.log(` ${invoiceId}`);

  process.stdout.write("Creating task document...");
  const task = await client.createDocumentInDrive(
    driveId,
    documentModelCreateDocument(),
  );
  const taskId = task.header.id;
  console.log(` ${taskId}`);

  // 3. Name the documents to establish a cross-document relationship
  await client.rename(invoiceId, "Invoice-001");
  await client.rename(taskId, "Task-001-Invoice-001");
  console.log('\nDocuments named: "Invoice-001" ↔ "Task-001-Invoice-001"\n');

  // 4. Set up a broad subscription watching ALL document changes.
  //    The callback implements the cross-document automation rule:
  //    "When an invoice is marked [PAID], close the corresponding task."
  let reacting = false;

  const unsubscribe = client.subscribe(
    {},
    (event: DocumentChangeEvent) => {
      // Log every event
      const names = event.documents
        .map((d) => d.header.name || d.header.id)
        .join(", ");
      log(`${event.type} → ${names}`);

      // Only react to updates (not creates, deletes, etc.)
      if (event.type !== DocumentChangeType.Updated) return;

      // Guard against re-entrant reactions
      if (reacting) return;

      for (const doc of event.documents) {
        const name = doc.header.name ?? "";

        // Rule: invoice marked [PAID] → close the related task
        if (name.includes("[PAID]") && !name.includes("[CLOSED]")) {
          // Extract invoice identifier from name (e.g. "Invoice-001")
          const invoiceKey = name.replace(" [PAID]", "");
          const expectedTaskName = `Task-001-${invoiceKey}`;

          log(`⚡ Rule triggered: "${name}" is paid`);
          log(`   Looking for task: "${expectedTaskName}"...`);

          reacting = true;
          // Find and close the related task from within the subscription handler
          client
            .find({ parentId: driveId })
            .then((result) => {
              const relatedTask = result.results.find(
                (d) =>
                  d.header.name === expectedTaskName &&
                  !d.header.name.includes("[CLOSED]"),
              );
              if (relatedTask) {
                log(
                  `   Found task ${relatedTask.header.id}, closing it...`,
                );
                return client.rename(
                  relatedTask.header.id,
                  `${relatedTask.header.name} [CLOSED]`,
                );
              } else {
                log(`   No open task found for "${invoiceKey}"`);
              }
            })
            .then(() => {
              reacting = false;
            })
            .catch((err) => {
              log(`   Error in reaction: ${err}`);
              reacting = false;
            });
        }
      }
    },
  );

  // 5. Trigger the workflow: mark the invoice as paid
  console.log("─── Triggering workflow: marking Invoice-001 as [PAID] ───\n");
  await client.rename(invoiceId, "Invoice-001 [PAID]");

  // 6. Wait for the async subscription handler to propagate
  await sleep(2000);

  // 7. Print final state
  console.log("\n─── Final document state ───\n");
  const finalInvoice = await client.get(invoiceId);
  const finalTask = await client.get(taskId);
  console.log(`  Invoice: "${finalInvoice.header.name}"`);
  console.log(`  Task:    "${finalTask.header.name}"`);

  const taskClosed = finalTask.header.name?.includes("[CLOSED]");
  console.log(
    `\n${taskClosed ? "✓" : "✗"} Cross-document reaction ${taskClosed ? "succeeded" : "failed"}`,
  );

  // 8. Cleanup
  unsubscribe();
  clientModule.reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
