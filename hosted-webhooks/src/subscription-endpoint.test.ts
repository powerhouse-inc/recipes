/**
 * These tests drive the reactor's own HTTP stack: core's Express adapter,
 * `HttpRouteService` as the dispatcher, and `WebhookService` over a
 * `MemoryWebhookStore`, all listening on a real socket (see `host.ts`). Every
 * request below is an actual HTTP request, so the refusals asserted here are
 * core's — the token lookup, the replay window, the HMAC over the received
 * octets, dedupe, the method check and the rate limit.
 */
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
} from "@powerhousedao/reactor";
import {
  AuthService,
  type AuthContext,
  type IHttpScope,
} from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import {
  createSubscriptionDocument,
  Subscription,
  type SubscriptionDocument,
} from "document-models/subscription/v1";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHost, subgraphArgs, type ReactorHost } from "./host.js";
import { stripeSignature } from "./stripe-signature.js";
import { SubscriptionWebhooksSubgraph } from "./subgraph.js";

const PACKAGE_NAME = "@powerhousedao/example-hosted-webhooks";
const SECRET = "whsec_test_secret";
const OPERATOR_BEARER = "operator-token";

/**
 * Core's `AuthService`, with only the credential check swapped out: minting a
 * bearer it would accept means signing a Renown verifiable credential, which is
 * a different recipe. Everything the routes depend on — the 401 for a missing
 * bearer on a `renown` route, and the anonymous-but-auth-enabled actor a
 * `renown-optional` route sees — is the real implementation, reached by
 * delegating to it whenever no bearer is presented.
 */
class TestAuthService extends AuthService {
  override async verifyBearer(
    authorization: string | undefined,
  ): Promise<AuthContext | Response> {
    const token = authorization?.split(" ")[1];
    if (!token) return super.verifyBearer(authorization);
    if (token !== OPERATOR_BEARER) {
      return new Response(JSON.stringify({ error: "Verification failed" }), {
        status: 401,
      });
    }
    return {
      user: {
        address: "0xoperator",
        chainId: 1,
        networkId: "eip155",
        appKey: "did:key:operator",
      },
      admins: [],
      auth_enabled: true,
    };
  }
}

/** One signing secret per document, which is what `policyFor` resolves. */
const secrets = new Map<string, string>();

class TestSubgraph extends SubscriptionWebhooksSubgraph {
  protected override secretFor(documentId: string): Promise<string | undefined> {
    return Promise.resolve(secrets.get(documentId));
  }
}

let client: IReactorClient;
let host: ReactorHost;
let scope: IHttpScope;
let subgraph: TestSubgraph;

/** Boots a host and puts the package's subgraph on it, as the reactor would. */
async function bootPackage(): Promise<{
  host: ReactorHost;
  scope: IHttpScope;
  subgraph: TestSubgraph;
}> {
  const booted = await startHost({
    authService: new TestAuthService({
      enabled: true,
      admins: [],
      skipCredentialVerification: true,
    }),
  });
  const packageScope = booted.scopeFor(PACKAGE_NAME);
  const packageSubgraph = new TestSubgraph(
    subgraphArgs({ http: packageScope, reactorClient: client }),
  );
  await packageSubgraph.onSetup();
  return { host: booted, scope: packageScope, subgraph: packageSubgraph };
}

async function newSubscription(): Promise<string> {
  const document = await client.create(createSubscriptionDocument());
  secrets.set(document.header.id, SECRET);
  return document.header.id;
}

function stripeEvent(type: string, id: string, object: unknown = {}): string {
  return JSON.stringify({ id, type, data: { object } });
}

/** A package route, over HTTP, relative to the scope's own base URL. */
function api(
  method: string,
  path: string,
  options: { bearer?: string; at?: IHttpScope } = {},
): Promise<Response> {
  const base = options.at ?? scope;
  return fetch(`${base.baseUrl}/${path}`, {
    method,
    headers: options.bearer
      ? { authorization: `Bearer ${options.bearer}` }
      : undefined,
  });
}

/** A delivery, as Stripe would send it: signed over the exact bytes. */
function send(
  url: string,
  body: string,
  options: { secret?: string; secondsAgo?: number; sentBody?: string } = {},
): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0);
  return fetch(url, {
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
}

/** Mints the endpoint for a document and returns the URL to hand a provider. */
async function endpointFor(documentId: string): Promise<string> {
  const minted = await subgraph.endpoints!.endpoints.endpointFor(documentId);
  return minted.url;
}

async function state(documentId: string) {
  const document = await client.get<SubscriptionDocument>(documentId);
  return document.state.global;
}

beforeAll(async () => {
  const built = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        Subscription,
      ]),
    )
    .buildModule();
  client = built.client;

  const booted = await bootPackage();
  host = booted.host;
  scope = booted.scope;
  subgraph = booted.subgraph;
}, 120_000);

afterAll(async () => {
  await host?.close();
});

describe("the URL space", () => {
  it("hangs the package's routes off its npm name, under /api", () => {
    expect(scope.baseUrl).toBe(`${host.publicUrl}/api/${PACKAGE_NAME}`);
  });

  it("advertises an absolute webhook URL, because the host knows its origin", () => {
    expect(scope.webhooks.hasPublicOrigin).toBe(true);
  });
});

describe("the endpoint URL", () => {
  it("names the token, never the document", async () => {
    const documentId = await newSubscription();
    const response = await api("POST", `subscriptions/${documentId}/endpoint`, {
      bearer: OPERATOR_BEARER,
    });
    const minted = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(minted.url).not.toContain(documentId);
    expect(minted.url).toMatch(
      new RegExp(`^${host.publicUrl}/webhooks/[0-9a-f]{32}$`),
    );
  });

  it("is stable, so a provider registration keeps working", async () => {
    const documentId = await newSubscription();

    expect(await endpointFor(documentId)).toBe(await endpointFor(documentId));
  });

  it("is refused without a bearer, because routes default to renown", async () => {
    const documentId = await newSubscription();

    const response = await api("POST", `subscriptions/${documentId}/endpoint`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });

  it("is refused for a document that does not exist", async () => {
    const response = await api("POST", "subscriptions/does-not-exist/endpoint", {
      bearer: OPERATOR_BEARER,
    });

    expect(response.status).toBe(404);
  });

  it("stops answering once revoked", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    const revoke = await api("DELETE", `subscriptions/${documentId}/endpoint`, {
      bearer: OPERATOR_BEARER,
    });
    expect(revoke.status).toBe(204);

    const delivery = await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_gone"),
    );
    expect(delivery.status).toBe(404);
  });
});

describe("a delivery", () => {
  it("advances the document when the signature verifies", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_activate", {
      customer: "cus_9",
      quantity: 5,
      plan: { nickname: "team" },
    });

    const response = await send(url, body);

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
    const url = await endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_tamper", {
      customer: "cus_1",
      quantity: 1,
    });

    // The signature is computed over `body`, and a different byte string is
    // sent. Core verifies against what arrived on the wire, so this fails even
    // though the two parse to nearly the same object.
    const response = await send(url, body, {
      sentBody: body.replace("cus_1", "cus_2"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Signature verification failed",
    });
    expect(await state(documentId)).toMatchObject({ status: "PENDING" });
  });

  it("is refused when it is signed with another endpoint's secret", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await send(
      url,
      stripeEvent("customer.subscription.created", "evt_wrong_secret"),
      { secret: "whsec_someone_else" },
    );

    expect(response.status).toBe(401);
  });

  it("is refused when the timestamp is outside the replay window", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await send(
      url,
      stripeEvent("customer.subscription.created", "evt_stale"),
      { secondsAgo: 3600 },
    );

    expect(response.status).toBe(401);
  });

  it("is refused with no signature at all", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stripeEvent("customer.subscription.created", "evt_bare"),
    });

    expect(response.status).toBe(401);
  });

  it("is refused when the method is not one the policy allows", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await fetch(url, { method: "GET" });

    expect(response.status).toBe(405);
  });

  it("is shed once the declared rate is exhausted", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    // `rateLimit: { perMinute: 120 }` is a token bucket of that capacity, so
    // the first 120 get through to the method check and the next is shed. The
    // loop rather than a fixed count because the bucket refills as it runs.
    let attempts = 0;
    let status = 0;
    while (attempts < 200 && status !== 429) {
      status = (await fetch(url, { method: "GET" })).status;
      attempts += 1;
    }

    expect(status).toBe(429);
    expect(attempts).toBeGreaterThan(120);
  }, 60_000);
});

describe("a redelivery", () => {
  it("answers 200 with an empty body and applies nothing twice", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_once", {
      customer: "cus_7",
      quantity: 2,
    });

    const first = await send(url, body);
    const second = await send(url, body);

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ applied: "ACTIVATE" });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe("");
    expect((await state(documentId)).processedEventIds).toEqual(["evt_once"]);
  });

  it("is caught by the document once core's dedupe window has passed", async () => {
    const documentId = await newSubscription();
    const body = stripeEvent("customer.subscription.created", "evt_ttl", {
      customer: "cus_8",
      quantity: 3,
    });
    await send(await endpointFor(documentId), body);

    // A second host: another replica, or the same one after a restart, whose
    // dedupe cache never saw the first delivery. (`MemoryWebhookStore` is
    // per-process, so it also mints a fresh token; with the relational store a
    // deployment shares both the token and the dedupe record.)
    const replica = await bootPackage();
    const moved = await replica.subgraph.endpoints!.endpoints.endpointFor(
      documentId,
    );
    const response = await send(moved.url, body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duplicate: "evt_ttl" });
    expect((await state(documentId)).processedEventIds).toEqual(["evt_ttl"]);
    await replica.host.close();
  });
});

describe("an event type the endpoint does not act on", () => {
  it("is acknowledged rather than retried", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await send(
      url,
      stripeEvent("charge.dispute.created", "evt_dispute"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ignored: "charge.dispute.created",
    });
  });
});

describe("a disarmed endpoint", () => {
  it("answers exactly as a token that was never minted", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    await send(
      url,
      stripeEvent("customer.subscription.created", "evt_a", {
        customer: "cus_2",
        quantity: 1,
      }),
    );
    await send(url, stripeEvent("customer.subscription.deleted", "evt_b"));
    expect(await state(documentId)).toMatchObject({ status: "CANCELED" });

    const disarmed = await send(
      url,
      stripeEvent("customer.subscription.created", "evt_c"),
    );
    const unknown = await send(
      `${host.publicUrl}/webhooks/${"f".repeat(32)}`,
      "{}",
    );

    expect(disarmed.status).toBe(unknown.status);
    expect(await disarmed.text()).toBe(await unknown.text());
  });
});

describe("the read route", () => {
  it("reports the state the deliveries produced", async () => {
    const documentId = await newSubscription();
    await send(
      await endpointFor(documentId),
      stripeEvent("customer.subscription.created", "evt_read", {
        customer: "cus_3",
        quantity: 4,
        plan: { nickname: "scale" },
      }),
    );

    const response = await api("GET", `subscriptions/${documentId}`, {
      bearer: OPERATOR_BEARER,
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

    const response = await api("GET", `subscriptions/${documentId}`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "sign in to read a subscription",
    });
  });
});

describe("the namespace", () => {
  it("is all a package can serve from: a path outside it is refused", () => {
    expect(() => scope.get("../../graphql", () => new Response())).toThrow();
    expect(() => scope.get("/graphql", () => new Response())).toThrow();
  });

  it("refuses a second registration of the same route, rather than shadowing it", () => {
    expect(() =>
      scope.get("subscriptions/:id", { auth: "public" }, () => new Response()),
    ).toThrow();
  });
});
