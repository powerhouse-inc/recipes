import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  IHttpScope,
  IWebhookEndpoints,
  RouteUser,
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
  /**
   * Who may do what to one subscription. Signing in only proves who the
   * caller is; these say whether that caller owns this document. The subgraph
   * answers them with the reactor's own authorization service, so they follow
   * the host's policy.
   */
  access: SubscriptionAccess;
}

export interface SubscriptionAccess {
  /** Mint or revoke the document's Stripe endpoint. */
  canManage(documentId: string, user: RouteUser | undefined): Promise<boolean>;
  /** Read the state the deliveries produced. */
  canRead(documentId: string, user: RouteUser | undefined): Promise<boolean>;
}

/**
 * The answer for a document the caller may not touch, and for one that does
 * not exist. They are the same answer on purpose: a different one for "exists,
 * but not yours" would let any signed-in caller probe for document ids.
 */
const UNKNOWN_SUBSCRIPTION = { error: "unknown subscription" };

export interface SubscriptionEndpoints {
  endpoints: IWebhookEndpoints;
  routes: ScopedRouteHandle[];
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function reply(body: unknown, status = RECEIVED): WebhookReply {
  return { status, contentType: JSON_CONTENT_TYPE, body: JSON.stringify(body) };
}

/**
 * The reply for a delivery this package could not process: a document it could
 * not load, a write that failed, a handler that threw. `unprocessed` tells core
 * to forget the delivery's dedupe key, so Stripe's retry (it retries any 5xx)
 * reaches the handler again instead of being answered as a redelivery.
 *
 * Upstream documents `unprocessed` for a handler whose owner is shutting
 * down. A transient failure is the same situation from the provider's side:
 * the delivery did not happen, and the retry is the only copy of the event.
 * The document's `processedEventIds` keeps a retry of a write that did land
 * from applying twice.
 */
function notProcessed(): WebhookReply {
  // The cause stays out of the body: the reply goes to the sender, and a
  // storage error's text is the host's business, not the provider's.
  return {
    ...reply({ error: "delivery not processed, retry it" }, 503),
    unprocessed: true,
  };
}

/**
 * The reactor's not-found errors. Matched by name because the classes are not
 * exported, and because only the name survives the reactor's job queue.
 */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "DocumentNotFoundError" ||
      error.name === "DocumentPurgedError")
  );
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
  const { reactorClient, secretFor, access } = deps;

  /**
   * The document, or undefined when it does not exist. Any other failure
   * throws: a storage error is not an answer about the document, and treating
   * it as "unknown" would disarm the endpoint or drop the delivery.
   */
  const load = async (documentId: string) => {
    try {
      return await reactorClient.get<SubscriptionDocument>(documentId);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
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
    // A load that fails rather than finding nothing throws through here, and
    // core answers 500. That is safe to retry: core resolves the policy before
    // it records the delivery's dedupe key, so Stripe's retry is processed.
    // Only a document that does not exist disarms its endpoint. A canceled
    // subscription stays armed: Stripe keeps delivering after the cancel
    // (retries of earlier events, late invoices), and a 404 for those is a
    // 4xx Stripe retries and then counts toward disabling the endpoint.
    const document = await load(documentId);
    if (!document) return undefined;

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
        scheme: "hmac-timestamped",
        secret: await secretFor(documentId),
        toleranceSeconds: 300,
      },
    };
  };

  /**
   * A delivery core has already method-checked, size-capped, verified against
   * the raw bytes and de-duplicated. What is left is what the event means.
   *
   * `request.key` is the document id this endpoint was minted for, so there is
   * no provider id to map back to a document, and the id is not in the URL.
   *
   * Core records the delivery's dedupe key *before* calling this, and keeps it
   * whatever the reply says unless the reply sets `unprocessed`. A reply that
   * means "try again" therefore has to say so, or Stripe's retry inside the
   * dedupe window is answered with an empty 200 and the event is lost. A
   * thrown handler is no different: core answers 500 and keeps the key, so
   * nothing below is allowed to throw.
   */
  const onRequest = async (request: WebhookRequest): Promise<WebhookReply> => {
    try {
      return await handle(request);
    } catch {
      return notProcessed();
    }
  };

  const handle = async (request: WebhookRequest): Promise<WebhookReply> => {
    const parsed = parseStripeEvent(request.body);
    if (!parsed.ok) {
      // 400 on purpose: a body this endpoint cannot read is a configuration
      // fault, and Stripe surfaces 4xx in its dashboard. A retry carries the
      // same bytes, so there is nothing for it to fix.
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

    // Canceled is final, and the reducer refuses every action on it. Answering
    // here says so without writing a refused operation into history.
    if (document.state.global.status === "CANCELED") {
      return reply({ rejected: action.type, status: "CANCELED" });
    }

    // `execute` throws only when the write itself failed: the job errored,
    // storage refused, the document vanished. Those are retryable, and the
    // catch in `onRequest` answers them as unprocessed. A reducer that refuses
    // the action does not throw: the operation is stored with its error and
    // the state is unchanged, so whether the event took is read off the
    // document the write returns.
    const result = await reactorClient.execute<SubscriptionDocument>(
      request.key,
      BRANCH,
      [action],
    );
    const state = result.state.global;
    if (!state.processedEventIds.includes(event.id)) {
      // The reducer refused it, and it will refuse it again, so a retry would
      // only repeat the work. Answering 200 stops the retries, and the body
      // records why.
      return reply({ rejected: action.type, status: state.status });
    }

    return reply({ applied: action.type, eventId: event.id });
  };

  const endpoints = await scope.webhooks.register({
    name: ENDPOINT_NAME,
    // Fixed for every endpoint in this family, so it belongs here rather than
    // in `policyFor`. The split is the point: `defaults` is a property of the
    // integration, `policyFor` is what the document configures.
    defaults: { methods: ["POST"] },
    policyFor,
    onRequest,
  });

  const routes: ScopedRouteHandle[] = [
    /**
     * The URL to paste into Stripe. Minting is idempotent per document, so
     * asking twice returns the same endpoint, and the document id is not in it.
     * The route's default `renown` auth has already refused a caller with no
     * bearer; what is left is whether this caller manages this document.
     */
    scope.post("subscriptions/:id/endpoint", async (_request, ctx) => {
      const documentId = ctx.params.id!;
      if (
        !(await access.canManage(documentId, ctx.user)) ||
        !(await load(documentId))
      ) {
        return json(404, UNKNOWN_SUBSCRIPTION);
      }
      const minted = await endpoints.endpointFor(documentId);
      return json(200, { url: minted.url, createdAt: minted.createdAt });
    }),

    /** Retires the URL. A later mint for the same document issues a new token. */
    scope.delete("subscriptions/:id/endpoint", async (_request, ctx) => {
      const documentId = ctx.params.id!;
      if (!(await access.canManage(documentId, ctx.user))) {
        return json(404, UNKNOWN_SUBSCRIPTION);
      }
      await endpoints.revoke(documentId);
      return new Response(null, { status: 204 });
    }),

    /**
     * The state the deliveries have produced. `renown-optional` because the
     * handler makes its own decision about who may read a document: an
     * anonymous caller arrives with no user instead of a 401. Sign-in is
     * checked first, then access, then existence, so neither an anonymous
     * caller nor a signed-in stranger learns which ids exist.
     */
    scope.get(
      "subscriptions/:id",
      { auth: "renown-optional" },
      async (_request, ctx) => {
        if (!ctx.user && ctx.authEnabled) {
          return json(401, { error: "sign in to read a subscription" });
        }
        const documentId = ctx.params.id!;
        if (!(await access.canRead(documentId, ctx.user))) {
          return json(404, UNKNOWN_SUBSCRIPTION);
        }
        const document = await load(documentId);
        if (!document) return json(404, UNKNOWN_SUBSCRIPTION);
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
