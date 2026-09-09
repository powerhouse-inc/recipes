import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  IHttpScope,
  IWebhookEndpoints,
  ScopedRouteHandle,
  WebhookPolicy,
  WebhookReply,
  WebhookRequest,
} from "@powerhousedao/reactor-api";
import type { SubscriptionDocument } from "document-models/subscription/v1";
import { actionForEvent, parseStripeEvent } from "./stripe-events.js";

/** The endpoint family's name. It distinguishes families, and never appears in a URL. */
const ENDPOINT_NAME = "stripe";
const BRANCH = "main";

/**
 * Stripe retries a delivery it could not read as a success, so the reply says
 * "received" for anything a retry cannot fix. The body says what happened.
 */
const RECEIVED = 200;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export interface SubscriptionEndpointDeps {
  /**
   * The reactor handle a subgraph already holds as `this.reactorClient`. The
   * client awaits its own jobs and throws on a failed one, so nothing here
   * has to reach for an event bus.
   */
  reactorClient: IReactorClient;
  /**
   * The Stripe signing secret for one subscription document. Read from wherever
   * the host keeps secrets, never from the document's public state.
   */
  secretFor: (documentId: string) => Promise<string | undefined>;
}

export interface SubscriptionEndpoints {
  endpoints: IWebhookEndpoints;
  routes: ScopedRouteHandle[];
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

/**
 * Registers this package's HTTP surface on the scope the reactor handed it.
 *
 * The scope is already bound to the package's namespace, so the routes below
 * are named relative to it: `subscriptions/:id` is served at
 * `<publicUrl>/api/@powerhousedao/example-hosted-webhooks/subscriptions/:id`.
 * There is no way to name a path outside that namespace.
 *
 * Nothing is returned for teardown: the host disposes a package's scope when
 * the package is replaced or the process shuts down, which releases every
 * route and webhook registration made through it.
 */
export async function registerSubscriptionEndpoints(
  scope: IHttpScope,
  deps: SubscriptionEndpointDeps,
): Promise<SubscriptionEndpoints> {
  const { reactorClient, secretFor } = deps;

  const load = async (documentId: string) => {
    try {
      return await reactorClient.get<SubscriptionDocument>(documentId);
    } catch {
      return undefined;
    }
  };

  /**
   * What core enforces before a delivery reaches `onRequest`, resolved per
   * document. Returning undefined disarms the endpoint, which core answers
   * exactly as it answers a token it has never seen: a prober cannot tell a
   * disarmed endpoint from one that never existed.
   */
  const policyFor = async (
    documentId: string,
  ): Promise<WebhookPolicy | undefined> => {
    const document = await load(documentId);
    if (!document) return undefined;
    if (document.state.global.status === "CANCELED") return undefined;

    return {
      // Stripe's event id is the top-level `id`, so a bare field name reaches
      // it. (`data.object.id` is the *object's* id — a subscription — which is
      // stable across events and would dedupe away everything after the
      // first.) The document records the same event id in `processedEventIds`,
      // which is the durable half: core's dedupe is a TTL cache, and a
      // redelivery after the TTL reaches the handler.
      dedupe: { field: "id", ttlSeconds: 3600 },
      // A document with no secret configured is refused with 401 rather than
      // accepted unverified: the endpoint is configured as signed, and there is
      // nothing to verify against.
      verify: {
        scheme: "stripe",
        secret: await secretFor(documentId),
        toleranceSeconds: 300,
      },
    };
  };

  /**
   * A delivery core has already rate-limited, verified against the raw bytes,
   * de-duplicated and method-checked. What is left is what the event means.
   *
   * `request.key` is the document id this endpoint was minted for, so there is
   * no provider id to map back to a document, and the id is not in the URL.
   */
  const onRequest = async (request: WebhookRequest): Promise<WebhookReply> => {
    const reply = (body: unknown, status = RECEIVED): WebhookReply => ({
      status,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(body),
    });

    const parsed = parseStripeEvent(request.body);
    if (!parsed.ok) {
      // 400 on purpose: a body this endpoint cannot read is a configuration
      // fault, and Stripe surfaces 4xx in its dashboard.
      return reply({ error: `unreadable event: ${parsed.reason}` }, 400);
    }

    const event = parsed.event;
    const action = actionForEvent(event);
    if (!action) return reply({ ignored: event.type });

    const document = await load(request.key);
    if (!document) return reply({ error: "unknown subscription" }, 404);

    // The document's own record of what it has already applied. The reducer
    // refuses a duplicate too, so this only keeps the failed operation out of
    // history.
    if (document.state.global.processedEventIds.includes(event.id)) {
      return reply({ duplicate: event.id });
    }

    try {
      await reactorClient.execute(request.key, BRANCH, [action]);
    } catch (error) {
      // A reducer that refused this event will refuse it again, so a retry
      // would only repeat the work. Answering 200 stops the retries, and the
      // body records why.
      return reply({
        rejected: action.type,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    return reply({ applied: action.type, eventId: event.id });
  };

  const endpoints = await scope.webhooks.register({
    name: ENDPOINT_NAME,
    // Fixed for every endpoint in this family, so it belongs here rather than
    // in `policyFor`. The split is the point: `defaults` is a property of the
    // integration, `policyFor` is what the document configures.
    defaults: { methods: ["POST"] },
    // The ceiling core applies per token, per registration. Capacity is the
    // declared rate, so this bounds a runaway provider at 120 a minute.
    rateLimit: { perMinute: 120 },
    policyFor,
    onRequest,
  });

  const routes: ScopedRouteHandle[] = [
    /**
     * The URL to paste into Stripe. Minting is idempotent per document, so
     * asking twice returns the same endpoint, and the document id is not in it.
     */
    scope.post("subscriptions/:id/endpoint", async (_request, ctx) => {
      const documentId = ctx.params.id!;
      if (!(await load(documentId))) {
        return json(404, { error: "unknown subscription" });
      }
      const minted = await endpoints.endpointFor(documentId);
      return json(200, { url: minted.url, createdAt: minted.createdAt });
    }),

    /** Retires the URL. A later mint for the same document issues a new token. */
    scope.delete("subscriptions/:id/endpoint", async (_request, ctx) => {
      await endpoints.revoke(ctx.params.id!);
      return new Response(null, { status: 204 });
    }),

    /**
     * The state the deliveries have produced. `renown-optional` because the
     * handler makes its own decision about who may read a document: an
     * anonymous caller arrives as an actor with no user instead of a 401.
     */
    scope.get(
      "subscriptions/:id",
      { auth: "renown-optional" },
      async (_request, ctx) => {
        const document = await load(ctx.params.id!);
        if (!document) return json(404, { error: "unknown subscription" });
        if (!ctx.actor?.user && ctx.actor?.authEnabled) {
          return json(401, { error: "sign in to read a subscription" });
        }
        const state = document.state.global;
        return json(200, {
          customerId: state.customerId,
          plan: state.plan,
          seats: state.seats,
          status: state.status,
          lastFailureReason: state.lastFailureReason,
          appliedEvents: state.processedEventIds.length,
        });
      },
    ),
  ];

  return { endpoints, routes };
}
