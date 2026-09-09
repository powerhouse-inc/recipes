import { JobAwaiter, ReactorBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import {
  createSubscriptionDocument,
  Subscription,
  type SubscriptionDocument,
} from "document-models/subscription/v1";
import { StandInHost, stripeSignature } from "./stand-in-host.js";
import { registerSubscriptionEndpoints } from "./subscription-endpoint.js";

const PACKAGE_NAME = "@powerhousedao/example-hosted-webhooks";
const PUBLIC_URL = "https://switchboard.example";
// In a deployment this is the value Stripe shows once, kept wherever the host
// keeps secrets. It is never document state.
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_demo_secret";
const OPERATOR_BEARER = "alice";

async function main() {
  console.log("Hosted Webhooks Demo");
  console.log("════════════════════\n");
  console.log(
    "A Stripe endpoint the reactor hosts drives one subscription document.",
  );
  console.log("The document id is never in the URL, and the bytes are verified");
  console.log("before this package's code runs.\n");

  process.stdout.write("Starting reactor...");
  const started = performance.now();
  const { reactor, eventBus } = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      Subscription,
    ])
    .buildModule();
  const awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
  console.log(` done (${((performance.now() - started) / 1000).toFixed(1)}s)`);

  const document = createSubscriptionDocument();
  const createJob = await reactor.create(document);
  await awaiter.waitForJob(createJob.id);
  const documentId = document.header.id;
  console.log(`Created subscription document ${documentId} (PENDING)\n`);

  // On a reactor this scope arrives as `this.http` inside a subgraph's
  // onSetup. The stand-in stops at the same interface.
  const host = new StandInHost({
    packageName: PACKAGE_NAME,
    publicUrl: PUBLIC_URL,
    bearer: (token) => (token === OPERATOR_BEARER ? "0xalice" : undefined),
  });
  const registered = await registerSubscriptionEndpoints(host.scope, {
    reactor,
    eventBus,
    secretFor: async () => SECRET,
  });
  console.log(`Package routes are served under ${host.scope.baseUrl}`);
  // A handle's url keeps its `:param` literal: it is the pattern, not a link.
  for (const url of new Set(registered.routes.map((route) => route.url))) {
    console.log(`  ${url}`);
  }

  // The operator asks for the URL to paste into Stripe.
  const minted = await host.request(
    "POST",
    `subscriptions/${documentId}/endpoint`,
    { bearer: OPERATOR_BEARER },
  );
  const endpoint = (await minted.json()) as { url: string };
  const token = endpoint.url.split("/").pop()!;
  console.log(`\nWebhook URL for Stripe: ${endpoint.url}`);
  console.log(
    `  ${endpoint.url.includes(documentId) ? "✗ leaks" : "✓ does not name"} the document\n`,
  );

  const event = (type: string, id: string, object: unknown = {}) =>
    JSON.stringify({ id, type, data: { object } });

  let deliveries = 0;
  const deliver = async (
    label: string,
    body: string,
    options: { secret?: string; secondsAgo?: number; sentBody?: string } = {},
  ) => {
    const timestamp = Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0);
    deliveries += 1;
    const response = await host.deliver(token, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(
          options.secret ?? SECRET,
          body,
          timestamp,
        ),
      },
      body: options.sentBody ?? body,
    });
    const text = await response.text();
    console.log(`→ ${label}`);
    console.log(`  ${response.status} ${text || "(empty body)"}`);
  };

  const activated = event("customer.subscription.created", "evt_1", {
    customer: "cus_4242",
    quantity: 5,
    plan: { nickname: "team" },
  });

  await deliver("customer.subscription.created", activated);
  await deliver("the same delivery again (Stripe retrying)", activated);
  await deliver("the same event, with the body altered after signing", activated, {
    sentBody: activated.replace("cus_4242", "cus_0000"),
  });
  await deliver("a delivery signed with another account's secret", activated, {
    secret: "whsec_not_ours",
  });
  await deliver("a delivery replayed an hour later", activated, {
    secondsAgo: 3600,
  });
  await deliver(
    "invoice.payment_failed",
    event("invoice.payment_failed", "evt_2", {
      last_payment_error: { message: "card declined" },
    }),
  );
  await deliver(
    "charge.dispute.created, which this endpoint does not act on",
    event("charge.dispute.created", "evt_3"),
  );
  await deliver(
    "customer.subscription.deleted",
    event("customer.subscription.deleted", "evt_4"),
  );
  await deliver(
    "one more delivery, now that the subscription is canceled",
    event("customer.subscription.created", "evt_5"),
  );

  const unknown = await host.deliver("f".repeat(32), {
    method: "POST",
    body: "{}",
  });
  console.log("\n→ a token that was never minted");
  console.log(`  ${unknown.status} ${await unknown.text()}`);
  console.log(
    "  ✓ same answer as the canceled endpoint above, so probing tells nothing apart",
  );

  const read = await host.request("GET", `subscriptions/${documentId}`, {
    bearer: OPERATOR_BEARER,
  });
  console.log("\n--- GET subscriptions/:id ---");
  console.log(`  ${read.status} ${await read.text()}`);

  const operations = await reactor.getOperations(documentId);
  const applied = (operations.global?.results ?? []).filter((operation) =>
    ["ACTIVATE", "MARK_PAST_DUE", "CANCEL"].includes(operation.action.type),
  );
  console.log("\n--- Document history ---");
  for (const operation of applied) console.log(`  ${operation.action.type}`);
  console.log(
    `\n✓ ${applied.length} operations from ${deliveries} deliveries: the refused, duplicate and ignored ones wrote nothing`,
  );

  const finalState = (await reactor.get<SubscriptionDocument>(documentId)).state
    .global;
  console.log(
    `✓ applied event ids recorded on the document: ${JSON.stringify(finalState.processedEventIds)}`,
  );

  registered.shutdown();
  awaiter.shutdown();
  reactor.kill();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
