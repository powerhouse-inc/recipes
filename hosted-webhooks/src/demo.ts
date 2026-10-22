import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import { documentModelDocumentModelModule } from "document-model";
import {
  createSubscriptionDocument,
  Subscription,
  type SubscriptionDocument,
} from "document-models/subscription/v1";
import { openAuthorization, startHost, subgraphArgs } from "./host.js";
import { stripeSignature } from "./stripe-signature.js";
import { SubscriptionWebhooksSubgraph } from "./subgraph.js";

const PACKAGE_NAME = "@powerhousedao/example-hosted-webhooks";
// In a deployment this is the value Stripe shows once, kept wherever the host
// keeps secrets. It is never document state.
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_demo_secret";

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
  // Writes are signed: a reactor that verifies refuses unsigned ones.
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "hosted-webhooks",
  );
  const { client } = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        Subscription,
      ]),
    )
    .withSigner(signer)
    .buildModule();
  console.log(` done (${((performance.now() - started) / 1000).toFixed(1)}s)`);

  // Core's HTTP adapter, route dispatcher and webhook service, on a real
  // socket. No authService, which is a host with auth disabled: every route
  // sees an anonymous actor, so the operator calls below need no bearer.
  const host = await startHost();
  const scope = host.scopeFor(PACKAGE_NAME);
  console.log(`Listening on ${host.publicUrl}`);

  const document = await client.create(createSubscriptionDocument());
  const documentId = document.header.id;
  console.log(`Created subscription document ${documentId} (PENDING)\n`);

  // Exactly what the reactor does when it loads this package: construct the
  // subgraph with its namespaced scope, then run onSetup.
  const subgraph = new SubscriptionWebhooksSubgraph(
    subgraphArgs({
      http: scope,
      reactorClient: client,
      // Auth is disabled on this host, so the reactor's policy is OPEN.
      authorizationService: openAuthorization(),
    }),
  );
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  await subgraph.onSetup();
  const registered = subgraph.endpoints!;

  console.log(`Package routes are served under ${scope.baseUrl}`);
  // A handle's url keeps its `:param` literal: it is the pattern, not a link.
  for (const url of new Set(registered.routes.map((route) => route.url))) {
    console.log(`  ${url}`);
  }

  // The operator asks for the URL to paste into Stripe.
  const minted = await fetch(
    `${scope.baseUrl}/subscriptions/${documentId}/endpoint`,
    { method: "POST" },
  );
  const endpoint = (await minted.json()) as { url: string };
  console.log(`\nWebhook URL for Stripe: ${endpoint.url}`);
  console.log(
    `  ${endpoint.url.includes(documentId) ? "✗ leaks" : "✓ does not name"} the document\n`,
  );

  // Stripe's own shapes, trimmed: a Subscription carries its plan and quantity
  // per item, and an Invoice carries the attempt count, not a decline message.
  const subscription = (status: string) => ({
    id: "sub_1Q",
    object: "subscription",
    customer: "cus_4242",
    status,
    items: {
      object: "list",
      data: [
        {
          id: "si_1Q",
          object: "subscription_item",
          quantity: 5,
          price: { id: "price_1Q", object: "price", nickname: "team" },
        },
      ],
    },
  });
  const invoice = {
    id: "in_1Q",
    object: "invoice",
    customer: "cus_4242",
    attempt_count: 1,
    next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86_400,
    last_finalization_error: null,
  };
  const event = (type: string, id: string, object: unknown) =>
    JSON.stringify({ id, object: "event", type, data: { object } });

  let deliveries = 0;
  const deliver = async (
    label: string,
    body: string,
    options: { secret?: string; secondsAgo?: number; sentBody?: string } = {},
  ) => {
    const timestamp = Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0);
    deliveries += 1;
    const response = await fetch(endpoint.url, {
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

  const activated = event(
    "customer.subscription.created",
    "evt_1",
    subscription("active"),
  );

  await deliver("customer.subscription.created", activated);
  await deliver("the same delivery again (Stripe retrying)", activated);
  await deliver(
    "the same event, with the body altered after signing",
    activated,
    { sentBody: activated.replace("cus_4242", "cus_0000") },
  );
  await deliver("a delivery signed with another account's secret", activated, {
    secret: "whsec_not_ours",
  });
  await deliver("a delivery replayed an hour later", activated, {
    secondsAgo: 3600,
  });
  await deliver(
    "invoice.payment_failed",
    event("invoice.payment_failed", "evt_2", invoice),
  );
  await deliver(
    "charge.dispute.created, which this endpoint does not act on",
    event("charge.dispute.created", "evt_3", { object: "dispute" }),
  );
  await deliver(
    "customer.subscription.deleted",
    event("customer.subscription.deleted", "evt_4", subscription("canceled")),
  );
  await deliver(
    "a late invoice.payment_failed, now that the subscription is canceled",
    event("invoice.payment_failed", "evt_5", invoice),
  );
  console.log(
    "  ✓ still armed: a 200 Stripe stops retrying, not a 4xx it counts against the endpoint",
  );

  // Retiring the URL is the operator's call, not the subscription's.
  const revoked = await fetch(
    `${scope.baseUrl}/subscriptions/${documentId}/endpoint`,
    { method: "DELETE" },
  );
  console.log(`
Revoked the endpoint (${revoked.status})`);
  await deliver(
    "a delivery to the revoked URL",
    event("invoice.payment_failed", "evt_6", invoice),
  );

  const unknown = await fetch(`${host.publicUrl}/webhooks/${"f".repeat(32)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  console.log("→ a token that was never minted");
  console.log(`  ${unknown.status} ${await unknown.text()}`);
  console.log(
    "  ✓ same answer as the revoked endpoint above, so probing tells nothing apart",
  );

  const read = await fetch(`${scope.baseUrl}/subscriptions/${documentId}`);
  console.log("\n--- GET subscriptions/:id ---");
  console.log(`  ${read.status} ${await read.text()}`);

  const operations = await client.getOperations(documentId);
  // A reducer refusal is stored as an operation with an error, so "applied"
  // means one without.
  const applied = operations.results.filter(
    (operation) =>
      ["ACTIVATE", "MARK_PAST_DUE", "CANCEL"].includes(operation.action.type) &&
      !operation.error,
  );
  console.log("\n--- Document history ---");
  for (const operation of applied) console.log(`  ${operation.action.type}`);
  console.log(
    `\n✓ ${applied.length} operations from ${deliveries} deliveries: the refused, duplicate, ignored and late ones wrote nothing`,
  );

  const finalState = (await client.get<SubscriptionDocument>(documentId)).state
    .global;
  console.log(
    `✓ applied event ids recorded on the document: ${JSON.stringify(finalState.processedEventIds)}`,
  );

  await host.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
