// src/lib/rateLimit.ts
// Simple in-memory rate limiter for API routes (per IP).
// Suitable for single-instance deployments (Vercel serverless will reset on cold starts,
// providing a natural baseline; for stronger limits use Vercel Edge Middleware or Upstash).

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent unbounded memory growth
const CLEANUP_INTERVAL = 60_000; // 1 min
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * Check whether a request should be rate-limited.
 *
 * @param ip      Client IP (from request headers or Astro.clientAddress)
 * @param limit   Maximum requests allowed in the window
 * @param windowMs  Time window in milliseconds (default 60 000 = 1 min)
 * @returns `null` if allowed, or a `Response` (429) if rate-limited.
 */
export function rateLimit(
  ip: string,
  limit: number = 20,
  windowMs: number = 60_000,
): Response | null {
  cleanup();

  const now = Date.now();
  const key = ip;

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: 'Trop de requêtes. Veuillez réessayer.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        },
      },
    );
  }

  return null;
}
