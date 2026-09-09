import {
  JobAwaiter,
  ReactorBuilder,
  type IEventBus,
  type IReactor,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import {
  createSubscriptionDocument,
  Subscription,
  type SubscriptionDocument,
} from "document-models/subscription/v1";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { StandInHost, stripeSignature } from "./stand-in-host.js";
import {
  registerSubscriptionEndpoints,
  type SubscriptionEndpoints,
} from "./subscription-endpoint.js";

const PACKAGE_NAME = "@powerhousedao/example-hosted-webhooks";
const PUBLIC_URL = "https://switchboard.example";
const SECRET = "whsec_test_secret";

let reactor: IReactor;
let eventBus: IEventBus;
let awaiter: JobAwaiter;
let host: StandInHost;
let registered: SubscriptionEndpoints;
const secrets = new Map<string, string>();

async function newSubscription(): Promise<string> {
  const document = createSubscriptionDocument();
  const job = await reactor.create(document);
  await awaiter.waitForJob(job.id);
  secrets.set(document.header.id, SECRET);
  return document.header.id;
}

function stripeEvent(type: string, id: string, object: unknown = {}): string {
  return JSON.stringify({ id, type, data: { object } });
}

async function send(
  token: string,
  body: string,
  options: { secret?: string; secondsAgo?: number } = {},
): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0);
  return host.deliver(token, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(
        options.secret ?? SECRET,
        body,
        timestamp,
      ),
    },
    body,
  });
}

async function state(documentId: string) {
  const document = await reactor.get<SubscriptionDocument>(documentId);
  return document.state.global;
}

beforeAll(async () => {
  const built = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      Subscription,
    ])
    .buildModule();
  reactor = built.reactor;
  eventBus = built.eventBus;
  awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  host = new StandInHost({
    packageName: PACKAGE_NAME,
    publicUrl: PUBLIC_URL,
    bearer: (token) => (token === "alice" ? "0xalice" : undefined),
  });

  registered = await registerSubscriptionEndpoints(host.scope, {
    reactor,
    eventBus,
    secretFor: async (documentId) => secrets.get(documentId),
  });
}, 120_000);

afterAll(() => {
  registered?.shutdown();
  awaiter?.shutdown();
  reactor?.kill();
});

describe("the endpoint URL", () => {
  it("names the token, never the document", async () => {
    const documentId = await newSubscription();
    const response = await host.request(
      "POST",
      `subscriptions/${documentId}/endpoint`,
      { bearer: "alice" },
    );
    const minted = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(minted.url).not.toContain(documentId);
    expect(minted.url).toMatch(
      new RegExp(`^${PUBLIC_URL}/webhooks/[0-9a-f]{32}$`),
    );
  });

  it("is stable, so a provider registration keeps working", async () => {
    const documentId = await newSubscription();
    const first = await registered.endpoints.endpointFor(documentId);
    const second = await registered.endpoints.endpointFor(documentId);

    expect(second.token).toBe(first.token);
  });

  it("is refused without a bearer, because routes default to renown", async () => {
    const documentId = await newSubscription();

    const response = await host.request(
      "POST",
      `subscriptions/${documentId}/endpoint`,
    );

    expect(response.status).toBe(401);
  });

  it("is refused for a document that does not exist", async () => {
    const response = await host.request(
      "POST",
      "subscriptions/does-not-exist/endpoint",
      { bearer: "alice" },
    );

    expect(response.status).toBe(404);
  });

  it("stops answering once revoked", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const revoke = await host.request(
      "DELETE",
      `subscriptions/${documentId}/endpoint`,
      { bearer: "alice" },
    );
    expect(revoke.status).toBe(204);

    const delivery = await send(token, stripeEvent("invoice.payment_failed", "evt_gone"));
    expect(delivery.status).toBe(404);
  });
});

describe("a delivery", () => {
  it("advances the document when the signature verifies", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_activate", {
      customer: "cus_9",
      quantity: 5,
      plan: { nickname: "team" },
    });

    const response = await send(token, body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      applied: "ACTIVATE",
      eventId: "evt_activate",
    });
    expect(await state(documentId)).toMatchObject({
      customerId: "cus_9",
      plan: "team",
      seats: 5,
      status: "ACTIVE",
    });
  });

  it("is refused when the body was altered after signing", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_tamper", {
      customer: "cus_1",
      quantity: 1,
    });
    const signature = stripeSignature(
      SECRET,
      body,
      Math.floor(Date.now() / 1000),
    );

    const response = await host.deliver(token, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: body.replace("cus_1", "cus_2"),
    });

    expect(response.status).toBe(401);
    expect(await state(documentId)).toMatchObject({ status: "PENDING" });
  });

  it("is refused when it is signed with another endpoint's secret", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);

    const response = await send(
      token,
      stripeEvent("customer.subscription.created", "evt_wrong_secret"),
      { secret: "whsec_someone_else" },
    );

    expect(response.status).toBe(401);
  });

  it("is refused when the timestamp is outside the replay window", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);

    const response = await send(
      token,
      stripeEvent("customer.subscription.created", "evt_stale"),
      { secondsAgo: 3600 },
    );

    expect(response.status).toBe(401);
  });

  it("is refused when the method is not one the policy allows", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);

    const response = await host.deliver(token, { method: "GET" });

    expect(response.status).toBe(405);
  });
});

describe("a redelivery", () => {
  it("answers 200 with an empty body and applies nothing twice", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_once", {
      customer: "cus_7",
      quantity: 2,
    });

    const first = await send(token, body);
    const second = await send(token, body);

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ applied: "ACTIVATE" });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe("");
    expect((await state(documentId)).processedEventIds).toEqual(["evt_once"]);
  });

  it("is caught by the document once core's dedupe window has passed", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_ttl", {
      customer: "cus_8",
      quantity: 3,
    });

    await send(token, body);
    // A second host, i.e. a dedupe cache that never saw the first delivery.
    const later = new StandInHost({
      packageName: PACKAGE_NAME,
      publicUrl: PUBLIC_URL,
    });
    const laterRegistration = await registerSubscriptionEndpoints(later.scope, {
      reactor,
      eventBus,
      secretFor: async (id) => secrets.get(id),
    });
    const moved = await laterRegistration.endpoints.endpointFor(documentId);
    const response = await later.deliver(moved.token, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(
          SECRET,
          body,
          Math.floor(Date.now() / 1000),
        ),
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duplicate: "evt_ttl" });
    expect((await state(documentId)).processedEventIds).toEqual(["evt_ttl"]);
    laterRegistration.shutdown();
  });
});

describe("an event type the endpoint does not act on", () => {
  it("is acknowledged rather than retried", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);

    const response = await send(
      token,
      stripeEvent("charge.dispute.created", "evt_dispute"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: "charge.dispute.created" });
  });
});

describe("a disarmed endpoint", () => {
  it("answers exactly as a token that was never minted", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    const activated = stripeEvent("customer.subscription.created", "evt_a", {
      customer: "cus_2",
      quantity: 1,
    });
    await send(token, activated);
    await send(token, stripeEvent("customer.subscription.deleted", "evt_b"));
    expect(await state(documentId)).toMatchObject({ status: "CANCELED" });

    const disarmed = await send(
      token,
      stripeEvent("customer.subscription.created", "evt_c"),
    );
    const unknown = await host.deliver("f".repeat(32), {
      method: "POST",
      body: "{}",
    });

    expect(disarmed.status).toBe(unknown.status);
    expect(await disarmed.text()).toBe(await unknown.text());
  });
});

describe("the read route", () => {
  it("reports the state the deliveries produced", async () => {
    const documentId = await newSubscription();
    const { token } = await registered.endpoints.endpointFor(documentId);
    await send(
      token,
      stripeEvent("customer.subscription.created", "evt_read", {
        customer: "cus_3",
        quantity: 4,
        plan: { nickname: "scale" },
      }),
    );

    const response = await host.request("GET", `subscriptions/${documentId}`, {
      bearer: "alice",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      customerId: "cus_3",
      plan: "scale",
      seats: 4,
      status: "ACTIVE",
      lastFailureReason: null,
      appliedEvents: 1,
    });
  });

  it("reaches the handler without a bearer, which answers 401 itself", async () => {
    const documentId = await newSubscription();

    const response = await host.request("GET", `subscriptions/${documentId}`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "sign in to read a subscription",
    });
  });
});
