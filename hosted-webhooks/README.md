# Hosted Webhooks

A package registers its own HTTP routes, and one Stripe endpoint per
subscription document, on the scope the reactor hands it. Core owns the
transport: the token in the URL, verification over the received bytes, the
replay window, redelivery and the body cap. The package decides which document
a delivery belongs to, and what the event means.

## Requires an unreleased build

`subgraph.http` is on
[powerhouse-inc/powerhouse#2980](https://github.com/powerhouse-inc/powerhouse/pull/2980),
which is open, so no published build carries it. Link a local monorepo
checkout until one does. Link `shared` and `reactor` too, or you get two
incompatible copies of every type: `reactor-api` only re-exports the HTTP
contract and `IReactorClient`.

```yaml
# pnpm-workspace.yaml. One machine's paths, so keep it out of every commit.
overrides:
  "@powerhousedao/reactor": "link:/path/to/powerhouse/packages/reactor"
  "@powerhousedao/reactor-api": "link:/path/to/powerhouse/packages/reactor-api"
  "@powerhousedao/shared": "link:/path/to/powerhouse/packages/shared"
```

## Two URL shapes

Package routes hang off the npm name, verbatim, under `<basePath>/api`:

```
POST   /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id/endpoint
DELETE /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id/endpoint
GET    /api/@powerhousedao/example-hosted-webhooks/subscriptions/:id
```

A path is relative to the scope, so a package cannot serve outside its
namespace. Webhook endpoints are flat and token-addressed:

```
POST /webhooks/2f7c0b9d41a8e35c6d0f1b8e7a4c92d0
```

`endpointFor(key)` mints the token, keyed by document id, so `request.key`
names the document.

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
  rateLimit: { perMinute: 120 },
  policyFor: async (documentId) => {
    const document = await load(documentId);
    if (!document) return undefined;
    if (document.state.global.status === "CANCELED") return undefined;
    return {
      dedupe: { field: "id", ttlSeconds: 3600 },
      verify: {
        scheme: "stripe",
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
rate-limited, method-checked, size-capped, verified against the exact octets
and de-duplicated. It answers `200` to an event it ignores: Stripe retries a
4xx, then disables the endpoint.

## Two dedupe layers

`dedupe: { field: "id" }` names the Stripe event id. Core answers a redelivery
inside the TTL with `200` and an empty body, calling nothing. That cache is per
host and expires, so the document records every applied id in
`processedEventIds` and its reducer throws `DuplicateEvent` on a repeat.

A field can also name a header (`{ header: "x-github-delivery" }`) or a nested
path (`{ body: "a.b.c" }`). Name the id that identifies the delivery: Stripe's
is the top-level `id`, not `data.object.id`, which is the subscription and
repeats across events.

## Running

```sh
pnpm start   # nine deliveries against one document, three of which stick
pnpm test    # verification, redelivery, disarming, rate limiting, the routes
```

Both speak real HTTP to core's own stack: the Express adapter,
`HttpRouteService`, and `WebhookService` over a `MemoryWebhookStore`.
`src/host.ts` is that wiring, which a reactor's `server.ts` does with the
relational token store. The demo plays a provider: a valid delivery, a retry, a
body altered after signing, and an hour-old replay.

## Related recipes

- [`inbound-webhook-bridge`](../inbound-webhook-bridge): the same job, with the
  listener and HMAC written by hand.
- [`rate-limiter`](../rate-limiter): a gate on the write path.
