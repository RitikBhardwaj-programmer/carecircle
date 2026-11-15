/**
 * In-memory token bucket per key (for example per IP).
 * It is per Cloud Run instance, so it slows down abuse but is not a global limit;
 * the Firestore login lockout is the durable control.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Takes one token. Returns false when the key is out of tokens. */
  take(key: string, nowMs: number = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: nowMs };
    const refill = ((nowMs - b.updated) / 60_000) * this.refillPerMinute;
    b.tokens = Math.min(this.capacity, b.tokens + refill);
    b.updated = nowMs;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    this.buckets.set(key, b);
    return true;
  }
}

export const loginLimiter = new RateLimiter(10, 5);
/** Profile creation is stricter: each profile can send reminder emails. */
export const createProfileLimiter = new RateLimiter(3, 0.2);
export const aiLimiter = new RateLimiter(8, 4);
export const doseLinkLimiter = new RateLimiter(20, 10);
