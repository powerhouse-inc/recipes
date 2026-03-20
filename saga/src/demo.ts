import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  documentModelCreateDocument,
} from "document-model";
import { driveDocumentModelModule, driveCreateDocument } from "document-drive";
import type { SagaDB } from "./schema.js";
import type { SagaStepDefinition } from "./processor.js";
import { up } from "./migrations.js";
import { createSagaFactory } from "./processor.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(msg: string) {
  console.log(`  [${ts()}] ${msg}`);
}

async function main() {
  console.log("Saga Pattern Demo");
  console.log("==================\n");
  console.log(
    "Demonstrates: processor-based saga coordination across documents,",
  );
  console.log("with a traceable saga_id linking every step.\n");

  // 1. Set up PGlite + Kysely for saga log
  const pglite = new KyselyPGlite();
  const db = new Kysely<SagaDB>({ dialect: pglite.dialect });
  await up(db);
  log("Saga log schema created");

  // 2. Build ReactorClient with embedded reactor
  process.stdout.write("  Starting reactor...");
  const t0 = performance.now();

  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModels([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ]),
    )
    .buildModule();

  const { client, reactorModule } = clientModule;
  const reactor = clientModule.reactor;
  const processorManager = reactorModule!.processorManager;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  // 3. Create a drive and three documents (order, payment, fulfillment)
  process.stdout.write("  Creating drive...");
  const drive = await client.create(driveCreateDocument());
  const driveId = drive.header.id;
  console.log(` ${driveId}`);

  process.stdout.write("  Creating order document...");
  const order = await client.createDocumentInDrive(
    driveId,
    documentModelCreateDocument(),
  );
  const orderId = order.header.id;
  console.log(` ${orderId}`);

  process.stdout.write("  Creating payment document...");
  const payment = await client.createDocumentInDrive(
    driveId,
    documentModelCreateDocument(),
  );
  const paymentId = payment.header.id;
  console.log(` ${paymentId}`);

  process.stdout.write("  Creating fulfillment document...");
  const fulfillment = await client.createDocumentInDrive(
    driveId,
    documentModelCreateDocument(),
  );
  const fulfillmentId = fulfillment.header.id;
  console.log(` ${fulfillmentId}`);

  // Name documents to establish identity
  await client.rename(orderId, "Order-001");
  await client.rename(paymentId, "Payment-001");
  await client.rename(fulfillmentId, "Fulfillment-001");
  console.log(
    '\n  Documents named: "Order-001", "Payment-001", "Fulfillment-001"\n',
  );

  // 4. Define saga steps
  //
  //    Order [CREATED] --> Payment [REQUESTED] --> Fulfillment [STARTED]
  //
  //    Step 1 (initial): Order renamed to include [CREATED]
  //      -> dispatches rename on Payment to include [REQUESTED]
  //    Step 2: Payment renamed to include [REQUESTED]
  //      -> dispatches rename on Fulfillment to include [STARTED]
  //    Step 3: Fulfillment renamed to include [STARTED]
  //      -> dispatches rename on Order to include [FULFILLED] (closes the saga)

  const steps: SagaStepDefinition[] = [
    {
      stepName: "order-created",
      triggerActionType: "SET_NAME",
      triggerMatch: (op) => {
        const name = (op.operation.action.input as Record<string, string>)?.name ?? "";
        return (
          op.context.documentId === orderId &&
          name.includes("[CREATED]") &&
          !name.includes("[FULFILLED]")
        );
      },
      isInitial: true,
      resolveTargetDocumentId: () => paymentId,
      buildActions: () => [
        { type: "SET_NAME", input: { name: "Payment-001 [REQUESTED]" } },
      ],
    },
    {
      stepName: "payment-requested",
      triggerActionType: "SET_NAME",
      triggerMatch: (op) => {
        const name = (op.operation.action.input as Record<string, string>)?.name ?? "";
        return (
          op.context.documentId === paymentId && name.includes("[REQUESTED]")
        );
      },
      isInitial: false,
      resolveTargetDocumentId: () => fulfillmentId,
      buildActions: () => [
        { type: "SET_NAME", input: { name: "Fulfillment-001 [STARTED]" } },
      ],
    },
    {
      stepName: "fulfillment-started",
      triggerActionType: "SET_NAME",
      triggerMatch: (op) => {
        const name = (op.operation.action.input as Record<string, string>)?.name ?? "";
        return (
          op.context.documentId === fulfillmentId && name.includes("[STARTED]")
        );
      },
      isInitial: false,
      resolveTargetDocumentId: () => orderId,
      buildActions: () => [
        { type: "SET_NAME", input: { name: "Order-001 [FULFILLED]" } },
      ],
    },
  ];

  // 5. Register the saga processor
  await processorManager.registerFactory(
    "saga",
    createSagaFactory({
      db,
      reactor,
      steps,
      filter: { branch: ["main"] },
    }),
  );
  log("Registered saga processor\n");

  // 6. Trigger the saga: mark the order as created
  console.log(
    "--- Triggering saga: renaming Order-001 to Order-001 [CREATED] ---\n",
  );
  await client.rename(orderId, "Order-001 [CREATED]");

  // 7. Wait for async processor propagation through all steps
  await sleep(3000);

  // 8. Print final document state
  console.log("\n--- Final document state ---\n");
  const finalOrder = await client.get(orderId);
  const finalPayment = await client.get(paymentId);
  const finalFulfillment = await client.get(fulfillmentId);
  console.log(`  Order:       "${finalOrder.header.name}"`);
  console.log(`  Payment:     "${finalPayment.header.name}"`);
  console.log(`  Fulfillment: "${finalFulfillment.header.name}"`);

  // 9. Print saga log
  console.log("\n--- Saga log ---\n");
  const entries = await db
    .selectFrom("saga_log")
    .selectAll()
    .orderBy("id", "asc")
    .execute();

  if (entries.length === 0) {
    console.log("  (no entries — processor may not have received operations)");
  } else {
    const sagaId = entries[0].saga_id;
    console.log(`  Saga ID: ${sagaId}\n`);
    for (const entry of entries) {
      console.log(
        `  Step: ${entry.step_name}`,
      );
      console.log(
        `    ${entry.source_document_id} -> ${entry.target_document_id}`,
      );
      console.log(
        `    action: ${entry.action_type}  status: ${entry.status}`,
      );
    }
  }

  const sagaComplete = finalOrder.header.name?.includes("[FULFILLED]");
  console.log(
    `\n${sagaComplete ? "+" : "x"} Saga ${sagaComplete ? "completed successfully" : "did not complete"}`,
  );

  // 10. Cleanup
  await db.destroy();
  clientModule.reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
