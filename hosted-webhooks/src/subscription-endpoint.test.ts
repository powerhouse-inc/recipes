/**
 * These tests drive the reactor's own HTTP stack: core's Express adapter,
 * `HttpRouteService` as the dispatcher, and `WebhookService` over a
 * `MemoryWebhookStore`, all listening on a real socket (see `host.ts`). Every
 * request below is an actual HTTP request, so the refusals asserted here are
 * core's — the token lookup, the replay window, the HMAC over the received
 * octets, dedupe and the method check.
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

/**
 * Failures to inject into the reactor the package sees, one per document id:
 * the next `execute` against that document throws, as a write that failed in
 * storage would. Everything else reaches the real client.
 */
const failNextExecute = new Set<string>();

function faultyClient(inner: IReactorClient): IReactorClient {
  return new Proxy(inner, {
    get(target, property, receiver) {
      if (property === "execute") {
        return (documentId: string, ...rest: unknown[]) => {
          if (failNextExecute.delete(documentId)) {
            return Promise.reject(new Error("storage unavailable"));
          }
          return (target.execute as (...args: unknown[]) => unknown)(
            documentId,
            ...rest,
          );
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

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
    subgraphArgs({ http: packageScope, reactorClient: faultyClient(client) }),
  );
  await packageSubgraph.onSetup();
  return { host: booted, scope: packageScope, subgraph: packageSubgraph };
}

async function newSubscription(): Promise<string> {
  const document = await client.create(createSubscriptionDocument());
  secrets.set(document.header.id, SECRET);
  return document.header.id;
}

/** The fields a fixture varies. Everything else is Stripe's shape, filled in. */
interface Fixture {
  customer?: string;
  status?: string;
  plan?: string;
  quantity?: number;
  attemptCount?: number;
  nextPaymentAttempt?: number | null;
  finalizationError?: string;
}

/**
 * A Stripe event as Stripe sends it: the envelope, and a `data.object` in the
 * real Subscription or Invoice shape, trimmed to the fields that matter. Plan
 * and quantity live on the subscription's first item, as they do in Stripe.
 */
function stripeEvent(type: string, id: string, fields: Fixture = {}): string {
  let object: unknown;
  if (type.startsWith("customer.subscription.")) {
    object = {
      id: "sub_1Q",
      object: "subscription",
      customer: fields.customer ?? "cus_1",
      status:
        fields.status ??
        (type === "customer.subscription.deleted" ? "canceled" : "active"),
      items: {
        object: "list",
        data: [
          {
            id: "si_1Q",
            object: "subscription_item",
            quantity: fields.quantity ?? 1,
            price: {
              id: "price_1Q",
              object: "price",
              nickname: fields.plan ?? null,
              lookup_key: null,
            },
          },
        ],
      },
    };
  } else if (type.startsWith("invoice.")) {
    object = {
      id: "in_1Q",
      object: "invoice",
      customer: fields.customer ?? "cus_1",
      status: "open",
      attempt_count: fields.attemptCount ?? 1,
      next_payment_attempt:
        fields.nextPaymentAttempt === undefined
          ? 1_767_225_600
          : fields.nextPaymentAttempt,
      last_finalization_error: fields.finalizationError
        ? { message: fields.finalizationError, type: "invalid_request_error" }
        : null,
    };
  } else {
    object = { id: "obj_1Q", object: type.split(".")[0] };
  }
  return JSON.stringify({ id, object: "event", type, data: { object } });
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
  // Writes are signed: a reactor that verifies refuses unsigned ones.
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "hosted-webhooks",
  );
  const built = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        Subscription,
      ]),
    )
    .withSigner(signer)
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
      plan: "team",
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

describe("a subscription event", () => {
  it("follows the status Stripe reports, not the event type", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    const update = async (id: string, status: string) => {
      const response = await send(
        url,
        stripeEvent("customer.subscription.updated", id, { status }),
      );
      return { status: response.status, body: await response.json() };
    };

    await send(url, stripeEvent("customer.subscription.created", "evt_s1"));
    expect(await state(documentId)).toMatchObject({ status: "ACTIVE" });

    expect(await update("evt_s2", "past_due")).toEqual({
      status: 200,
      body: { applied: "MARK_PAST_DUE", eventId: "evt_s2" },
    });
    expect(await state(documentId)).toMatchObject({
      status: "PAST_DUE",
      lastFailureReason: "subscription is past_due",
    });

    await update("evt_s3", "active");
    expect(await state(documentId)).toMatchObject({
      status: "ACTIVE",
      lastFailureReason: null,
    });

    await update("evt_s4", "canceled");
    expect(await state(documentId)).toMatchObject({ status: "CANCELED" });
  });

  it("acknowledges a status the document does not model, and changes nothing", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    const response = await send(
      url,
      stripeEvent("customer.subscription.created", "evt_incomplete", {
        status: "incomplete",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ignored: "customer.subscription.created",
    });
    expect(await state(documentId)).toMatchObject({ status: "PENDING" });
  });

  it("names the plan by its price, falling back to the price id", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    await send(
      url,
      stripeEvent("customer.subscription.created", "evt_unnamed_price", {
        quantity: 3,
      }),
    );

    expect(await state(documentId)).toMatchObject({
      plan: "price_1Q",
      seats: 3,
    });
  });

  it("is refused as unreadable when it is not Stripe's shape", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    // Top-level plan and quantity, no items: not a Subscription object.
    const response = await send(
      url,
      JSON.stringify({
        id: "evt_invented",
        type: "customer.subscription.created",
        data: { object: { customer: "cus_1", quantity: 2 } },
      }),
    );

    expect(response.status).toBe(400);
    expect(await state(documentId)).toMatchObject({ status: "PENDING" });
  });
});

describe("a payment failure", () => {
  it("records what the invoice says about the failed attempt", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    await send(url, stripeEvent("customer.subscription.created", "evt_p1"));

    await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_p2", {
        attemptCount: 2,
        nextPaymentAttempt: 1_767_225_600,
      }),
    );

    expect(await state(documentId)).toMatchObject({
      status: "PAST_DUE",
      lastFailureReason:
        "payment attempt 2 failed, next attempt 2026-01-01T00:00:00.000Z",
    });
  });

  it("is recorded again when a retry fails too, not dropped", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    await send(url, stripeEvent("customer.subscription.created", "evt_r1"));
    await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_r2", { attemptCount: 1 }),
    );

    const second = await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_r3", {
        attemptCount: 2,
        nextPaymentAttempt: null,
      }),
    );

    expect(await second.json()).toEqual({
      applied: "MARK_PAST_DUE",
      eventId: "evt_r3",
    });
    expect(await state(documentId)).toMatchObject({
      status: "PAST_DUE",
      lastFailureReason: "payment attempt 2 failed, no retry scheduled",
      processedEventIds: ["evt_r1", "evt_r2", "evt_r3"],
    });
  });

  it("prefers the invoice's finalization error when there is one", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    await send(url, stripeEvent("customer.subscription.created", "evt_f1"));

    await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_f2", {
        finalizationError: "The customer has no tax location.",
      }),
    );

    expect(await state(documentId)).toMatchObject({
      lastFailureReason:
        "invoice could not be finalized: The customer has no tax location.",
    });
  });
});

describe("a delivery the package could not process", () => {
  it("is answered 503 and unprocessed, so Stripe's retry is applied", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);
    const body = stripeEvent("customer.subscription.created", "evt_transient", {
      customer: "cus_5",
      quantity: 1,
    });

    failNextExecute.add(documentId);
    const first = await send(url, body);
    expect(first.status).toBe(503);
    expect(await state(documentId)).toMatchObject({ status: "PENDING" });

    // Inside core's dedupe window. Without `unprocessed` on the first reply,
    // core would answer this with an empty 200 and never call the handler.
    const retry = await send(url, body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({
      applied: "ACTIVATE",
      eventId: "evt_transient",
    });
    expect(await state(documentId)).toMatchObject({ status: "ACTIVE" });
  });

  it("is rejected with 200, not retried, when the reducer refuses it", async () => {
    const documentId = await newSubscription();
    const url = await endpointFor(documentId);

    // A payment failure for a subscription that was never activated: the
    // reducer refuses the transition, and a retry would be refused again.
    const response = await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_too_early"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rejected: "MARK_PAST_DUE",
      status: "PENDING",
    });
    expect((await state(documentId)).processedEventIds).toEqual([]);
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

describe("a canceled subscription", () => {
  it("keeps its endpoint armed and acknowledges later deliveries", async () => {
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

    // A late event for a canceled subscription is not an error Stripe can fix,
    // so it is answered 200 rather than a 4xx Stripe would retry and count
    // toward disabling the endpoint.
    const late = await send(
      url,
      stripeEvent("invoice.payment_failed", "evt_c"),
    );

    expect(late.status).toBe(200);
    expect(await late.json()).toEqual({
      rejected: "MARK_PAST_DUE",
      status: "CANCELED",
    });
    expect((await state(documentId)).processedEventIds).toEqual([
      "evt_a",
      "evt_b",
    ]);
  });
});

describe("a disarmed endpoint", () => {
  it("answers exactly as a token that was never minted", async () => {
    // Minted for a key with no document behind it: `policyFor` returns
    // undefined, which is what disarming is.
    const url = await endpointFor("not-a-subscription");

    const disarmed = await send(
      url,
      stripeEvent("customer.subscription.created", "evt_disarmed"),
    );
    const unknown = await send(
      `${host.publicUrl}/webhooks/${"f".repeat(32)}`,
      "{}",
    );

    expect(disarmed.status).toBe(404);
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
        plan: "scale",
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
