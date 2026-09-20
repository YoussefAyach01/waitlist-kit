/** In-memory sliding-window limiter. Per-process: fine for one server, use Redis if you scale out. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Returns { ok, retryAfterSec }. Counts the attempt only when allowed. */
  check(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] as number;
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(cutoff);
    return { ok: true, retryAfterSec: 0 };
  }

  private prune(cutoff: number) {
    for (const [k, v] of this.hits) {
      if (v.every((t) => t <= cutoff)) this.hits.delete(k);
    }
  }
}

type Limiters = { joinPerList: RateLimiter; joinPerIp: RateLimiter; login: RateLimiter };
const g = globalThis as unknown as { __wlLimiters?: Limiters };
g.__wlLimiters ??= {
  joinPerList: new RateLimiter(10, 60_000),
  joinPerIp: new RateLimiter(60, 60_000),
  login: new RateLimiter(5, 15 * 60_000),
};
export const limiters: Limiters = g.__wlLimiters;
