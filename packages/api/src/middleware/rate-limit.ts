import type { MiddlewareHandler } from "hono";

/**
 * Rate limit in-memory (MVP single-instance).
 * Bucket sliding window por IP + path prefix.
 *
 * Para escalar multi-instancia: mover a Redis.
 *
 * Defaults razonables — overrideable por opciones:
 *   60 requests / 60 segundos por IP por endpoint
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL = 5 * 60 * 1000; // 5 min

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
  lastSweep = now;
}

export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  /** Etiqueta para el bucket (típicamente nombre de endpoint). */
  scope?: string;
};

export function rateLimit(opts: RateLimitOptions = {}): MiddlewareHandler {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const scope = opts.scope ?? "default";

  return async (c, next) => {
    const now = Date.now();
    sweep(now);

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";

    const key = `${scope}:${ip}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > limit) {
        const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
        c.header("Retry-After", String(retryAfterSec));
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", "0");
        return c.json(
          {
            error: "rate_limit_exceeded",
            detail: `max ${limit} req per ${Math.round(windowMs / 1000)}s for scope '${scope}'`,
            retryAfterSec,
          },
          429
        );
      }
    }
    const current = buckets.get(key)!;
    const remaining = Math.max(0, limit - current.count);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    await next();
    // Re-setear post-next porque el handler puede haber sobrescrito headers
    c.res.headers.set("X-RateLimit-Limit", String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(remaining));
  };
}
