# Hosted Webhooks

A package registers its own HTTP routes, and one Stripe endpoint per
subscription document, on the scope the reactor hands it. Core owns the
transport: the token in the URL, verification over the received bytes, the
replay window, redelivery and the body cap. The package is left with which
document a delivery belongs to, and what the event means.

## Requires an unreleased build

`subgraph.http` and `subgraph.http.webhooks` are on
[powerhouse-inc/powerhouse#2980](https://github.com/powerhouse-inc/powerhouse/pull/2980),
which is open. `@powerhousedao/reactor-api@6.2.2-dev.84`, the newest `dev`
build, exports no `IHttpScope`, so this recipe does not depend on `reactor-api`.
`src/http-contract.ts` copies the contract from that branch,
`packages/shared/processors/http.ts`. Delete it and import the same names from
`reactor-api` once a build carries the PR. `src/stand-in-host.ts`
stands in for core's `WebhookService`, so `pnpm start` and `pnpm test` drive
the real code.

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

`endpointFor(key)` mints the token, keyed here by document id, so
`request.key` is the document a delivery belongs to.

## Wiring it into a subgraph

The scope arrives as `this.http`, and `register` is awaited in `onSetup`
because that call mounts the endpoint family:

```ts
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { registerSubscriptionEndpoints } from "./subscription-endpoint.js";
// The reactor handle, event bus and secret lookup, wired where the package is
// built. `BaseSubgraph` supplies `this.http` and `this.reactorClient`, not these.
import { deps } from "./runtime.js";

export class SubscriptionWebhooksSubgraph extends BaseSubgraph {
  name = "subscription-webhooks";

  async onSetup() {
    await registerSubscriptionEndpoints(this.http, deps);
  }
}
```

That file is not in the recipe, because the published `BaseSubgraph` has no
`http`. `WorkflowRuntimeSubgraph.onSetup` in
[reactor-workflow](https://github.com/powerhouse-inc/reactor-workflow) is the
in-tree consumer.

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

`undefined` disarms the endpoint, which core answers exactly as a token it
never minted: `404 {"error":"Unknown endpoint"}`. By the time `onRequest` runs,
a delivery is method-checked, size-capped, verified against the exact octets
and de-duplicated. It answers `200` to an event it ignores, since Stripe
retries a 4xx and then disables the endpoint.

## Two dedupe layers

`dedupe: { field: "id" }` names the Stripe event id. Core answers a redelivery
inside the TTL with `200` and an empty body, without calling `onRequest`. That
cache is per host and expires, so the document also records every applied id in
`processedEventIds`, and its reducer throws `DuplicateEvent` on a repeat.

A field can name a query parameter or top-level body field, a header
(`{ header: "x-github-delivery" }`), or a nested path (`{ body: "a.b.c" }`).
Name the id identifying the delivery. Stripe's is the top-level `id`, not
`data.object.id`, which is the subscription and repeats across events.

## Running

```sh
pnpm start   # nine deliveries against one document, three of which stick
pnpm test    # verification, redelivery, disarming, and the routes
```

The demo plays a provider: a valid delivery, a retry, a body altered after
signing, an hour-old replay, and one delivery too late.

## Related recipes

- [`inbound-webhook-bridge`](../inbound-webhook-bridge): the same job, with the
  listener and HMAC written by hand.
- [`rate-limiter`](../rate-limiter): a gate on the write path.
