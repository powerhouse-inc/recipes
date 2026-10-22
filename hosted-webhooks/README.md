# Hosted Webhooks

A package registers its own HTTP routes, and one Stripe endpoint per
subscription document, on the scope the reactor hands it. Core owns the
transport: the token in the URL, verification over the received bytes, the
replay window, redelivery and the body cap. The package decides which document
a delivery belongs to, and what the event means.

## Two URL shapes

Package routes hang off the npm name, verbatim, under `<basePath>/api`:

```
POST   /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id/endpoint
DELETE /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id/endpoint
GET    /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id
```

A path is relative to the scope, so a package cannot serve outside its
namespace. Signing in is not enough to use the routes: mint and revoke ask the
reactor's `authorizationService.canManage` (host admin, document owner or ADMIN
grant), and the read asks `canRead`. A caller who may not touch a document gets
the same `404` as for one that does not exist, and the read checks sign-in
first, so no one can probe for document ids. Webhook endpoints are flat and token-addressed:

```
POST /webhooks/2f7c0b9d41a8e35c6d0f1b8e7a4c92d0
```

`endpointFor(key)` mints the token, keyed by document id (a slug in the route
is resolved first), so `request.key` names the document.

Stripe sends every event on the account to every endpoint registered on it,
and gives each endpoint its own signing secret. So a document applies only
the events for the customer its first activation recorded, and acknowledges
the rest. The manifest's single `STRIPE_WEBHOOK_SECRET` verifies one
document's endpoint; with more than one document, override `secretFor`.

## A subgraph, not a processor

The scope arrives on `SubgraphArgs`, so `src/subgraph.ts` is a `BaseSubgraph`
whose `onSetup` registers the surface:

```ts
export class SubscriptionWebhooksSubgraph extends BaseSubgraph {
  override name = "subscription-webhooks";

  override async onSetup() {
    this.endpoints = await registerSubscriptionEndpoints(this.http, {
      reactorClient: this.reactorClient,
      secretFor: (id) => this.secretFor(id),
      access: {
        canManage: (id, user) => this.mayManage(id, user),
        canRead: (id, user) => this.mayRead(id, user),
      },
    });
  }
}
```

A processor is driven by operations leaving the reactor, and nothing here is:
Stripe drives the traffic, and the document is the result. No `onDisconnect`
either: the host disposes the package's scope on teardown and on shutdown,
releasing its routes.

## What core enforces, and what this package decides

`policyFor(key)` is the per-document half of a registration:

```ts
const endpoints = await scope.webhooks.register({
  name: "stripe",
  // Fixed for the family. Anything a document configures goes in policyFor.
  defaults: { methods: ["POST"] },
  policyFor: async (documentId) => {
    // Only a missing document disarms. A canceled one stays armed.
    const document = await load(documentId);
    if (!document) return undefined;
    return {
      dedupe: { field: "id", ttlSeconds: 3600 },
      verify: {
        scheme: "hmac-timestamped",
        secret: await secretFor(documentId),
        toleranceSeconds: 300,
      },
    };
  },
  onRequest: (request) => applyEvent(request),
});
```

`undefined` disarms the endpoint, which core answers as an unknown token:
`404 {"error":"Unknown endpoint"}`. By `onRequest`, a delivery is
method-checked, size-capped, verified against the exact octets and
de-duplicated. It answers `200` to an event it ignores and to one the document
refuses, including anything that arrives after a cancel: Stripe retries a 4xx,
then disables the endpoint.

The event maps by what Stripe reports, not by its type. A subscription event
follows `data.object.status` (`active` and `trialing` activate, `past_due` and
`unpaid` mark it past due, `canceled` cancels), and the plan and seats come
from `items.data[0]`. Stripe does not order events, and this document keeps no
watermark: an event its state refuses (a payment failure before the
activation) is acknowledged and not retried.

## Two dedupe layers

`dedupe: { field: "id" }` names the Stripe event id. Core answers a redelivery
inside the TTL with `200` and an empty body, calling nothing. That cache is per
host and expires, so the document records every applied id in
`processedEventIds` and its reducer throws `DuplicateEvent` on a repeat.

Core records the id *before* it calls `onRequest`, and keeps it whatever the
reply says. A delivery the package could not process (a failed load or write)
answers `503` with `unprocessed: true`, which makes core forget the id so
Stripe's retry is handled instead of answered as a redelivery.

A field can also name a header (`{ header: "x-github-delivery" }`) or a nested
path (`{ body: "a.b.c" }`). Name the id that identifies the delivery: Stripe's
is the top-level `id`, not `data.object.id`, which is the subscription and
repeats across events.

## Running

```sh
pnpm start   # ten deliveries against one document, three of which stick
pnpm test    # verification, redelivery, retries, Stripe's shapes, the routes
```

Both speak real HTTP to core's own stack: the Express adapter,
`HttpRouteService`, and `WebhookService` over a `MemoryWebhookStore`.
`src/host.ts` is that wiring, which a reactor's `server.ts` does with the
relational token store. The demo plays a provider: a valid delivery, a retry, a
body altered after signing, an hour-old replay, a delivery after the cancel,
and one to a revoked URL.

## Related recipes

- [`inbound-webhook-bridge`](../inbound-webhook-bridge): the same job, with the
  listener and HMAC written by hand.
- [`rate-limiter`](../rate-limiter): a gate on the write path.
