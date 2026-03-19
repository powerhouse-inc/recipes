# Discord Webhook Processor

A Reactor `IProcessor` that posts document operations to a Discord channel via webhook.

Each operation is converted into a Discord embed containing:

- Action type, document ID, document type, scope, branch, hash
- Truncated action input (max 1024 chars)
- Timestamp

Batches exceeding Discord's 10-embed limit are automatically chunked into multiple requests. Every request includes an HMAC-SHA256 signature in the `X-Reactor-Signature` header.

## Usage

Register the processor with a Reactor `ProcessorManager`:

```ts
import { createDiscordWebhookFactory } from "@powerhousedao/example-discord-webhook-processor";

await processorManager.registerFactory(
  "discord-webhook",
  createDiscordWebhookFactory({
    webhookUrl: "https://discord.com/api/webhooks/{id}/{token}",
    secret: process.env.WEBHOOK_SECRET!,
    filter: {
      documentType: ["powerhouse/billing-statement"],
      scope: ["global"],
      branch: ["main"],
    },
  }),
);
```

## Tests

```sh
pnpm test
```
