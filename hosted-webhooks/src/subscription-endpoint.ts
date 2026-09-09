import {
  JobAwaiter,
  JobStatus,
  type IEventBus,
  type IReactor,
} from "@powerhousedao/reactor";
import type { SubscriptionDocument } from "document-models/subscription/v1";
import type {
  IHttpScope,
  IWebhookEndpoints,
  ScopedRouteHandle,
  WebhookPolicy,
  WebhookReply,
  WebhookRequest,
} from "./http-contract.js";
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
  reactor: IReactor;
  eventBus: IEventBus;
  /**
   * The Stripe signing secret for one subscription document. Read from wherever
   * the host keeps secrets, never from the document's public state.
   */
  secretFor: (documentId: string) => Promise<string | undefined>;
}

export interface SubscriptionEndpoints {
  endpoints: IWebhookEndpoints;
  routes: ScopedRouteHandle[];
  shutdown: () => void;
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
 */
export async function registerSubscriptionEndpoints(
  scope: IHttpScope,
  deps: SubscriptionEndpointDeps,
): Promise<SubscriptionEndpoints> {
  const { reactor, secretFor } = deps;
  const awaiter = new JobAwaiter(deps.eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );

  const load = async (documentId: string) => {
    try {
      return await reactor.get<SubscriptionDocument>(documentId);
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
      methods: ["POST"],
      // Stripe puts the event id at the top level of the body, so core can read
      // it. The document records the same id in `processedEventIds`, which is
      // the durable half: core's dedupe is a TTL cache, and a redelivery after
      // the TTL reaches the handler.
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

    const job = await reactor.execute(request.key, BRANCH, [action]);
    const info = await awaiter.waitForJob(job.id);
    if (info.status === JobStatus.FAILED) {
      // A reducer that refused this event will refuse it again, so a retry
      // would only repeat the work. Answering 200 stops the retries, and the
      // body records why.
      return reply({
        rejected: action.type,
        reason: info.error?.message ?? "job failed",
      });
    }

    return reply({ applied: action.type, eventId: event.id });
  };

  const endpoints = await scope.webhooks.register({
    name: ENDPOINT_NAME,
    // The ceiling core applies per token, per registration. A burst of ten is
    // admitted whatever this says, so it bounds a runaway provider rather than
    // shaping traffic.
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

  return {
    endpoints,
    routes,
    shutdown: () => {
      for (const route of routes) route.dispose();
      awaiter.shutdown();
    },
  };
}
