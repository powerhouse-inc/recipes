# Rate Limiter

A Reactor `IProcessor` paired with an `AuthService` gate to throttle users by signer address, preventing any single user from overwhelming the system with excessive operations.

## How it works

The recipe has two components that form a feedback loop:

1. **`RateLimiterProcessor`** sits inside the Reactor and observes every operation. It extracts the signer address from `operation.action.context.signer.user.address`, counts operations per user within a sliding time window, and calls `authService.cooldown()` when a user exceeds the threshold. The processor never throws — it only signals.

2. **`AuthService`** sits in front of the Reactor (e.g. in a GraphQL resolver or HTTP middleware). Before forwarding a mutation, the caller checks `authService.isAllowed(address)`. If the user is on cooldown, the response includes `retryAfterMs` so the client knows when to retry.

```
Client → [AuthService gate] → Reactor → RateLimiterProcessor → authService.cooldown()
              ↑                                                        |
              └────────────────────────────────────────────────────────┘
```

Operations without a signer are silently skipped. Counters are in-memory and reset on processor disconnect or restart.

## Architecture

| Module | Purpose |
|--------|---------|
| `src/auth-service.ts` | `AuthService` — in-memory cooldown gate with `cooldown()`, `isAllowed()`, and `getCooldownRemaining()` |
| `src/rate-limiter-processor.ts` | `RateLimiterProcessor` — the `IProcessor` implementation; also exports `createRateLimiterFactory` |

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `maxOperations` | `number` | Maximum operations allowed per user within the time window |
| `windowMs` | `number` | Length of the sliding time window in milliseconds |
| `cooldownMs` | `number` | How long a user is blocked after exceeding the limit |
| `filter` | `ProcessorFilter` | Which operations the processor subscribes to (document type, scope, branch, etc.) |

## Usage

### Register the processor

```ts
import { AuthService } from "@powerhousedao/example-rate-limiter/src/auth-service.js";
import { createRateLimiterFactory } from "@powerhousedao/example-rate-limiter/src/rate-limiter-processor.js";

// Shared instance — pass to both the GQL layer and the processor
const authService = new AuthService();

await processorManager.registerFactory(
  "rate-limiter",
  createRateLimiterFactory({
    authService,
    maxOperations: 100,
    windowMs: 60_000,    // 1-minute window
    cooldownMs: 300_000, // 5-minute cooldown
    filter: { branch: ["main"] },
  }),
);
```

### Gate requests in your GraphQL / HTTP layer

```ts
const check = authService.isAllowed(userAddress);
if (!check.allowed) {
  res.set("Retry-After", String(Math.ceil(check.retryAfterMs! / 1000)));
  throw new Error(`Rate limited. Retry after ${check.retryAfterMs}ms`);
}
```

### Check cooldown status

```ts
const remainingMs = authService.getCooldownRemaining(userAddress);
```

## Exports

```ts
export { AuthService } from "./src/auth-service.js";
export type { AuthCheckResult } from "./src/auth-service.js";
export { RateLimiterProcessor, createRateLimiterFactory } from "./src/rate-limiter-processor.js";
export type { RateLimiterConfig } from "./src/rate-limiter-processor.js";
```

## Tests

```sh
pnpm test
```
