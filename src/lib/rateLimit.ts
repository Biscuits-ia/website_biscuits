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
 * Low-level primitive. Keys by the value passed in.
 * Prefer `rateLimitRoute` in route handlers so the key is namespaced.
 */
export function rateLimit(
  key: string,
  limit: number = 20,
  windowMs: number = 60_000,
): Response | null {
  cleanup();

  const now = Date.now();
  const fullKey = key;

  const entry = store.get(fullKey);

  if (!entry || now > entry.resetAt) {
    store.set(fullKey, { count: 1, resetAt: now + windowMs });
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

/**
 * Rate-limit scoped to a single route + IP.
 * Use inside an `APIRoute` handler with a specific quota.
 *
 * @example
 *   const blocked = rateLimitRoute(ip, '/api/contact', 5, 10 * 60_000);
 *   if (blocked) return blocked;
 */
export function rateLimitRoute(
  ip: string,
  route: string,
  limit: number,
  windowMs: number,
): Response | null {
  return rateLimit(`${route}:${ip}`, limit, windowMs);
}
