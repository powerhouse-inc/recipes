import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthService } from "./auth-service.js";

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AuthService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows unknown addresses by default", () => {
    const result = service.isAllowed("0xabc");
    expect(result).toEqual({ allowed: true });
  });

  it("blocks an address after cooldown is set", () => {
    service.cooldown("0xabc", 5000);
    const result = service.isAllowed("0xabc");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(5000);
  });

  it("allows an address after cooldown expires", () => {
    service.cooldown("0xabc", 5000);
    vi.advanceTimersByTime(5001);
    const result = service.isAllowed("0xabc");
    expect(result).toEqual({ allowed: true });
  });

  it("returns correct retryAfterMs mid-cooldown", () => {
    service.cooldown("0xabc", 10_000);
    vi.advanceTimersByTime(3000);
    const result = service.isAllowed("0xabc");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeLessThanOrEqual(7000);
    expect(result.retryAfterMs).toBeGreaterThan(6000);
  });

  it("tracks multiple users independently", () => {
    service.cooldown("0xabc", 5000);
    expect(service.isAllowed("0xabc").allowed).toBe(false);
    expect(service.isAllowed("0xdef").allowed).toBe(true);
  });

  it("getCooldownRemaining returns 0 for unknown address", () => {
    expect(service.getCooldownRemaining("0xabc")).toBe(0);
  });

  it("getCooldownRemaining returns remaining ms during cooldown", () => {
    service.cooldown("0xabc", 10_000);
    vi.advanceTimersByTime(4000);
    const remaining = service.getCooldownRemaining("0xabc");
    expect(remaining).toBeLessThanOrEqual(6000);
    expect(remaining).toBeGreaterThan(5000);
  });

  it("getCooldownRemaining returns 0 after expiry", () => {
    service.cooldown("0xabc", 5000);
    vi.advanceTimersByTime(5001);
    expect(service.getCooldownRemaining("0xabc")).toBe(0);
  });

  it("a later cooldown call extends the cooldown", () => {
    service.cooldown("0xabc", 5000);
    vi.advanceTimersByTime(3000);
    service.cooldown("0xabc", 10_000);
    vi.advanceTimersByTime(5000);
    // 8s total elapsed, but second cooldown started at 3s for 10s → expires at 13s
    expect(service.isAllowed("0xabc").allowed).toBe(false);
  });
});
