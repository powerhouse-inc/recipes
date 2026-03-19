import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OperationWithContext } from "document-model";
import { AuthService } from "./auth-service.js";
import { RateLimiterProcessor } from "./rate-limiter-processor.js";

function makeOp(address?: string): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: String(Date.now()),
      hash: "abc",
      action: {
        id: "act-1",
        type: "SOME_ACTION",
        timestampUtcMs: String(Date.now()),
        input: {},
        scope: "global",
        ...(address
          ? {
              context: {
                signer: {
                  user: { address, networkId: "eip155", chainId: 1 },
                  app: { name: "test", key: "key" },
                  signatures: [],
                },
              },
            }
          : {}),
      },
    },
    context: {
      documentId: "doc-1",
      documentType: "test/doc",
      scope: "global",
      branch: "main",
      ordinal: 0,
    },
  };
}

describe("RateLimiterProcessor", () => {
  let authService: AuthService;
  let processor: RateLimiterProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
    authService = new AuthService();
    processor = new RateLimiterProcessor(authService, {
      maxOperations: 3,
      windowMs: 10_000,
      cooldownMs: 30_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not trigger cooldown under the threshold", async () => {
    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(true);
  });

  it("triggers cooldown when threshold is exceeded", async () => {
    const ops = Array.from({ length: 4 }, () => makeOp("0xabc"));
    await processor.onOperations(ops);
    const result = authService.isAllowed("0xabc");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets window after windowMs elapses", async () => {
    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc"), makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(true);

    vi.advanceTimersByTime(11_000);

    // New window — should count from 0 again
    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(true);
  });

  it("skips operations without a signer", async () => {
    const ops = Array.from({ length: 10 }, () => makeOp(undefined));
    await processor.onOperations(ops);
    // No cooldowns should have been set
    expect(authService.isAllowed("0xanonymous").allowed).toBe(true);
  });

  it("tracks multiple users independently", async () => {
    const ops = [
      ...Array.from({ length: 4 }, () => makeOp("0xabc")),
      ...Array.from({ length: 2 }, () => makeOp("0xdef")),
    ];
    await processor.onOperations(ops);

    expect(authService.isAllowed("0xabc").allowed).toBe(false);
    expect(authService.isAllowed("0xdef").allowed).toBe(true);
  });

  it("triggers cooldown across multiple onOperations calls", async () => {
    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(true);

    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(false);
  });

  it("cleans up windows on disconnect", async () => {
    await processor.onOperations([makeOp("0xabc"), makeOp("0xabc"), makeOp("0xabc")]);
    await processor.onDisconnect();

    // After disconnect + reconnect, counter is reset
    // (a new processor would be created, but we test the cleanup)
    await processor.onOperations([makeOp("0xabc")]);
    expect(authService.isAllowed("0xabc").allowed).toBe(true);
  });
});
