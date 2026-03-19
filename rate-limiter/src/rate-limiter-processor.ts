import type { OperationWithContext } from "document-model";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/reactor";
import type { AuthService } from "./auth-service.js";

export type RateLimiterConfig = {
  maxOperations: number;
  windowMs: number;
  cooldownMs: number;
};

type UserWindow = {
  count: number;
  windowStart: number;
};

function getSignerAddress(op: OperationWithContext): string | undefined {
  return op.operation.action.context?.signer?.user.address;
}

/**
 * A Reactor processor that counts operations per signer address within a
 * sliding time window. When a user exceeds `maxOperations` within `windowMs`,
 * it places them on cooldown via the shared {@link AuthService}.
 *
 * The processor never throws — it only signals the AuthService to block
 * the user at the gate (e.g. in the GraphQL layer).
 *
 * Operations without a signer are silently skipped.
 */
export class RateLimiterProcessor implements IProcessor {
  private readonly windows = new Map<string, UserWindow>();

  constructor(
    private readonly authService: AuthService,
    private readonly config: RateLimiterConfig,
  ) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const now = Date.now();

    for (const op of operations) {
      const address = getSignerAddress(op);
      if (!address) continue;

      let window = this.windows.get(address);

      if (!window || now - window.windowStart >= this.config.windowMs) {
        window = { count: 0, windowStart: now };
        this.windows.set(address, window);
      }

      window.count++;

      if (window.count > this.config.maxOperations) {
        this.authService.cooldown(address, this.config.cooldownMs);
      }
    }
  }

  async onDisconnect(): Promise<void> {
    this.windows.clear();
  }
}

/**
 * Creates a ProcessorFactory that produces a RateLimiterProcessor
 * with the given configuration.
 *
 * @example
 * ```ts
 * const authService = new AuthService();
 *
 * await processorManager.registerFactory(
 *   "rate-limiter",
 *   createRateLimiterFactory({
 *     authService,
 *     maxOperations: 100,
 *     windowMs: 60_000,
 *     cooldownMs: 300_000,
 *     filter: { branch: ["main"] },
 *   }),
 * );
 *
 * // In your GraphQL resolver / HTTP middleware:
 * const check = authService.isAllowed(userAddress);
 * if (!check.allowed) {
 *   throw new Error(`Rate limited. Retry after ${check.retryAfterMs}ms`);
 * }
 * ```
 */
export function createRateLimiterFactory(config: {
  authService: AuthService;
  maxOperations: number;
  windowMs: number;
  cooldownMs: number;
  filter: ProcessorFilter;
}): ProcessorFactory {
  return () => [
    {
      processor: new RateLimiterProcessor(config.authService, {
        maxOperations: config.maxOperations,
        windowMs: config.windowMs,
        cooldownMs: config.cooldownMs,
      }),
      filter: config.filter,
      startFrom: "current",
    },
  ];
}
