# Inbound Webhook Bridge

Receive external webhooks (Stripe-style), verify the signature **server-side
against the raw request bytes**, and map verified events onto document actions.
This is the inbound twin of [`discord-webhook-processor`](../discord-webhook-processor)
(documents → external service). Here the flow runs the other way: external
service → documents.

## The headline rule: verify the raw bytes

> **`JSON.parse(body)` → `JSON.stringify(parsed)` breaks HMAC.** The signature
> is computed over the exact bytes the provider sent. Re-serializing changes key
> order, whitespace, and number formatting, so the signature no longer matches.

Always verify the raw body string, *then* parse it. This recipe uses a small
`node:http` listener precisely so it controls the bytes. A GraphQL/JSON
mutation resolver parses the body before your code runs, which is why
[the brief](../briefs/04-inbound-webhook-bridge.md) recommends a dedicated
listener when raw-body access is awkward.

## How it works

```
provider ──POST raw body + x-webhook-signature──▶ createWebhookServer (node:http)
                                                     │  1. read raw bytes (no parse yet)
                                                     │  2. verifyWebhook() — HMAC over `${t}.${rawBody}`,
                                                     │     constant-time compare, replay-window check
                                                     │  3. JSON.parse the verified bytes
                                                     ▼
                                                  WebhookBridge.handleEvent
                                                     │  4. resolve orderId → documentId
                                                     │  5. dedup vs persisted processedEventIds
                                                     │  6. map event type → typed action
                                                     ▼
                                                  reactor.execute → Payment document
```

`reactor.execute` hands the mapped action to the reactor, the
`@powerhousedao/reactor` instance that stores the documents and applies
operations to them.

### Signature scheme (modelled on Stripe)

The `x-webhook-signature` header is `t=<unixSeconds>,v1=<hmacHex>`, and the
signed payload is `` `${t}.${rawBody}` ``. Folding the timestamp into the
signature is what makes the replay-window check trustworthy. The timestamp can't be altered
independently of the signature.

```ts
import { signWebhook, verifyWebhook } from "@powerhousedao/example-inbound-webhook-bridge";

const header = signWebhook(secret, rawBody, Math.floor(Date.now() / 1000));
const verdict = verifyWebhook({ secret, rawBody, signatureHeader: header, nowSeconds });
// { ok: true, timestampSeconds } | { ok: false, reason }
```

Verification rejects: missing/malformed header, signature mismatch (wrong
secret *or* tampered/re-serialized body), and timestamps outside the tolerance
window (default 5 minutes). Comparison uses `crypto.timingSafeEqual`.

### Idempotency that survives restarts

Providers redeliver. Every event that mutates the document records its provider
`event.id` in the document's `processedEventIds` state. Because the dedup set
lives in **document state**, not in the memory of a long-running listener, it is
rebuilt for free after a restart. The bridge short-circuits a known event id
(keeping history clean), and the reducer refuses a duplicate as a second
line of defense for racing redeliveries.

## The payment document model

A deliberately small state machine, **generated** from
`document-models/payment/payment.json` via `pnpm generate` (pinned
`ph-cli`, `catalog:`):

```
PENDING ──recordPayment──▶ PAID ──recordRefund──▶ REFUNDED
   └──────markFailed──────▶ FAILED
```

| Event type          | Action          |
|---------------------|-----------------|
| `payment.succeeded` | `recordPayment` |
| `payment.failed`    | `markFailed`    |
| `refund.created`    | `recordRefund`  |

State: `{ orderId, amountCents, currency, status, failureReason, processedEventIds }`.

The reducer logic (the state-machine guards + event-id dedup) is hand-maintained
at `document-models/payment/v1/src/reducers/payment.ts`. Everything under
`document-models/payment/v1/gen/` is codegen output and isn't edited.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/signature.ts` | `signWebhook` / `verifyWebhook`: pure HMAC helpers (raw-bytes, constant-time, replay window) |
| `document-models/payment/` | The `powerhouse/payment` document model and its hand-written reducer |
| `src/webhook-bridge.ts` | `WebhookBridge` (event → action, dedup, dispatch) and `createWebhookServer` (raw-body HTTP edge) |
| `src/demo.ts` | Boots a reactor + endpoint and plays the provider: valid / tampered / duplicate / stale events |

## Secrets

The signing secret is read **only on the server** and must never be bundled for
the browser. `WEBHOOK_SIGNING_SECRET`, the shared HMAC-SHA256 secret for
verifying the `x-webhook-signature` header, is declared as a required `secret`
in the `config` block of [`powerhouse.manifest.json`](./powerhouse.manifest.json),
the way production packages document required secrets. Load it from the
environment server-side, and keep it out of any code path that could be bundled
for the client.

## Running

```sh
pnpm start   # runs the demo
pnpm test    # signature, reducer, and HTTP integration tests
```

The demo prints the document's final state and history, showing **exactly one**
state-changing operation despite the tampered, duplicate, and stale deliveries.

## Related recipes

- [`discord-webhook-processor`](../discord-webhook-processor): the outbound
  twin (documents → external service).
- [`rate-limiter`](../rate-limiter): precedent for gating the write path.
- [`saga`](../saga): what to read next if one webhook should fan out across
  multiple documents.
