import type { AddressInfo } from "node:net";
import { ReactorBuilder, JobAwaiter } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createPaymentDocument,
  Payment,
  type PaymentDocument,
} from "document-models/payment/v1";
import { WebhookBridge, createWebhookServer, type WebhookEvent } from "./webhook-bridge.js";
import { signWebhook, SIGNATURE_HEADER } from "./signature.js";

const SECRET = "whsec_demo_shared_secret";
const ORDER_ID = "order-1001";

async function main() {
  console.log("Inbound Webhook Bridge Demo");
  console.log("═══════════════════════════\n");
  console.log("A signed external webhook drives a payment document's state machine.");
  console.log("Signatures are verified against the RAW request bytes.\n");

  // 1. Build a reactor that knows about the payment document model.
  process.stdout.write("Starting reactor...");
  const t0 = performance.now();
  const { reactor, eventBus } = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      Payment,
    ])
    .buildModule();
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  const jobAwaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  // 2. Create a pending payment document for the order.
  const paymentDoc = createPaymentDocument({
    global: { orderId: ORDER_ID, amountCents: 4200, currency: "usd" },
  });
  const createJob = await reactor.create(paymentDoc);
  await jobAwaiter.waitForJob(createJob.id);
  const documentId = paymentDoc.header.id;
  console.log(`Created payment document ${documentId} for ${ORDER_ID} (PENDING)\n`);

  // 3. Wire the bridge. The resolver maps a provider order id to its document.
  //    In production this would be a read-model lookup; here a single order.
  const bridge = new WebhookBridge(reactor, eventBus, async (orderId) =>
    orderId === ORDER_ID ? documentId : null,
  );
  const server = createWebhookServer({ secret: SECRET, bridge });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  console.log(`Webhook endpoint listening on http://localhost:${port}\n`);

  // --- Play the provider --------------------------------------------------
  const post = (body: string, signature: string) =>
    fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature },
      body,
    });

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const succeeded: WebhookEvent = {
    id: "evt_aaa111",
    type: "payment.succeeded",
    data: { orderId: ORDER_ID, amountCents: 4200 },
  };
  const body = JSON.stringify(succeeded);

  // (a) Valid event — advances PENDING -> PAID.
  console.log("→ POST payment.succeeded (valid signature)");
  let res = await post(body, signWebhook(SECRET, body, nowSeconds()));
  console.log(`  ${res.status} ${JSON.stringify(await res.json())}`);

  // (b) Tampered body — signature was computed over the original bytes, so the
  //     altered bytes fail verification. (Re-stringified JSON fails the same way.)
  console.log("\n→ POST payment.succeeded (tampered body, stale signature)");
  const tampered = body.replace("4200", "999999");
  res = await post(tampered, signWebhook(SECRET, body, nowSeconds()));
  console.log(`  ${res.status} ${JSON.stringify(await res.json())}`);

  // (c) Duplicate delivery — same event id, freshly + validly signed. Deduped
  //     against the document's persisted processedEventIds.
  console.log("\n→ POST payment.succeeded again (duplicate event id, valid signature)");
  res = await post(body, signWebhook(SECRET, body, nowSeconds()));
  console.log(`  ${res.status} ${JSON.stringify(await res.json())}`);

  // (d) Replay outside the tolerance window — valid signature, stale timestamp.
  console.log("\n→ POST payment.succeeded (valid signature, 1h-old timestamp)");
  const old = nowSeconds() - 3600;
  res = await post(body, signWebhook(SECRET, body, old));
  console.log(`  ${res.status} ${JSON.stringify(await res.json())}`);

  // 4. Show final state + history: exactly one state-changing operation.
  await new Promise<void>((r) => setTimeout(r, 200));
  const finalDoc = await reactor.get<PaymentDocument>(documentId);
  console.log("\n--- Final payment state ---");
  console.log(`  status:            ${finalDoc.state.global.status}`);
  console.log(`  amountCents:       ${finalDoc.state.global.amountCents}`);
  console.log(`  processedEventIds: ${JSON.stringify(finalDoc.state.global.processedEventIds)}`);

  const ops = await reactor.getOperations(documentId);
  const global = ops.global?.results ?? [];
  const domainOps = global.filter((op) =>
    ["RECORD_PAYMENT", "MARK_FAILED", "RECORD_REFUND"].includes(op.action.type),
  );
  console.log("\n--- Document history (domain operations) ---");
  for (const op of domainOps) {
    console.log(`  ${op.action.type}${op.error ? ` (error: ${op.error})` : ""}`);
  }
  console.log(
    `\n${domainOps.length === 1 ? "✓" : "✗"} exactly ${domainOps.length} state change recorded`,
  );

  // 5. Cleanup.
  bridge.shutdown();
  jobAwaiter.shutdown();
  server.close();
  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
