export type AuthCheckResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

export class AuthService {
  private readonly cooldowns = new Map<string, number>();

  cooldown(address: string, durationMs: number): void {
    const expiry = Date.now() + durationMs;
    this.cooldowns.set(address, expiry);
  }

  isAllowed(address: string): AuthCheckResult {
    const expiry = this.cooldowns.get(address);
    if (expiry === undefined) {
      return { allowed: true };
    }

    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      this.cooldowns.delete(address);
      return { allowed: true };
    }

    return { allowed: false, retryAfterMs: remaining };
  }

  getCooldownRemaining(address: string): number {
    const expiry = this.cooldowns.get(address);
    if (expiry === undefined) return 0;

    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      this.cooldowns.delete(address);
      return 0;
    }

    return remaining;
  }
}
