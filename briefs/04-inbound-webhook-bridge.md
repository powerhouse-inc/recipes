# Recipe brief: inbound-webhook-bridge

**One-liner:** A subgraph that receives external webhooks (Stripe-style), verifies the
signature server-side, and maps verified events into document actions — the inbound
twin of `discord-webhook-processor`.

## Why this recipe

`discord-webhook-processor` covers documents → external service; nothing covers
external service → documents, yet two production packages depend on exactly that:
`power-eat` drives its whole order/subscription lifecycle off Stripe webhooks, and
`op-hub` confirms on-chain payments via Alchemy webhooks. The pattern has real
security footguns (signature verification, raw-body handling, replay) that deserve a
worked example.

## What it demonstrates

- A custom subgraph as an HTTP entry point on the reactor (mutation or raw endpoint).
- HMAC signature verification before anything is parsed or dispatched.
- Mapping external event types onto a document state machine via typed actions.
- Replay protection by event-id dedup.
- Declaring secrets via the package manifest `config` block so they never reach the
  browser.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__power-eat`** — Stripe Connect, end to end.
  - `dist/browser/stripe-clyp1SSB.js` — verified symbols:
    `webhooks.constructEvent` (signature verification against
    `PH_CONNECT_STRIPE_WEBHOOK_SECRET`), `processStripeWebhookEvent`,
    `checkout.session.*` event routing. Comments in source state the design rule:
    "STRIPE_SECRET_KEY never reaches the browser."
  - `dist/browser/subgraphs/stripe/index.d.ts` — the subgraph mounted at `/stripe`
    on Switchboard, separate from the read-oriented marketplace subgraph (dual-subgraph
    split: reads vs. payment mutations).
  - `dist/document-models/subscription/v1/gen/schema/types.d.ts` — subscription status
    enum mirroring Stripe exactly (`ACTIVE | CANCELED | INCOMPLETE | PAST_DUE |
    PAUSED | UNPAID | ...`), with webhook-driven operations
    (`activateSubscription`, `recordSubscriptionInvoicePaid`, `markSubscriptionCanceled`,
    `syncSubscriptionFromStripe`).
- **`op-hub`** — second data point, different provider.
  - `dist/types/subgraphs/invoice-addon/customResolvers.d.ts` — `handleWebhook`
    processing `AlchemyWebhookPayload.event.activity` to confirm pending on-chain
    payments and dispatch `registerPaymentTx` into the invoice document.
  - `dist/powerhouse.manifest.json` — the `config` block (~lines 283–333): typed
    entries `{ name, type: "secret" | "var", description, required }` for
    `REQUEST_FINANCE_API_KEY`, `ALCHEMY_API_KEY`, `SAFE_API_KEY`, etc. Worth copying
    as the way a recipe documents its required secrets.

## Suggested shape

Standalone package `@powerhousedao/example-inbound-webhook-bridge`.

- Small "payment" document model: `{ orderId, amountCents, status: PENDING |
  PAID | FAILED | REFUNDED }` with operations `recordPayment`, `markFailed`,
  `recordRefund`.
- `webhook.ts` — handler taking `(rawBody: string, signatureHeader: string)`:
  1. HMAC-SHA256 verify against shared secret (constant-time compare),
  2. reject if timestamp too old (replay window),
  3. dedup by `event.id` (table or in-memory set seeded from doc state),
  4. map `payment.succeeded` / `payment.failed` / `refund.created` → actions,
  5. dispatch into the matching document.
- Wire it as a subgraph resolver/endpoint the way the repo's subgraph recipes do
  (`relational-db-subgraph`, `audit-trail`); if raw-body access via reactor-api proves
  awkward, fall back to a tiny standalone HTTP listener sharing the reactor instance —
  and document why (HMAC needs the exact bytes).
- `demo.ts` — boots the reactor + endpoint, then plays the provider role: posts a valid
  event (state advances), a tampered signature (rejected), a duplicate event id
  (ignored), prints the document history showing exactly one state change.
- Tests for each of those paths.

## Implementation notes & pitfalls

- **Verify against the raw request bytes.** JSON parse → re-stringify breaks HMAC.
  This is the most common real-world webhook bug; make it the README's headline.
- Constant-time signature comparison (`crypto.timingSafeEqual`).
- Idempotency: providers redeliver. Event-id dedup must survive restarts — store
  processed ids in the document (or a processor-maintained table), not only in memory.
- Respond 2xx fast; do heavy work after acknowledging (or document the tradeoff).
- Keep the secret out of any code path that could be bundled for the browser; load
  from env, document via manifest-style config table in the README.

## Related recipes in this repo

- `discord-webhook-processor` — the outbound twin; cross-link both READMEs.
- `rate-limiter` — precedent for gating the write path.
- `saga` — what to read next if one webhook should fan out across documents.
