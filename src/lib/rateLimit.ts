// src/lib/rateLimit.ts
// Rate limiter local, sans service externe.
//
// Chaque instance Vercel conserve une Map bornee. Cette protection limite les
// rafales sur une instance, mais n'est pas un quota global entre toutes les
// fonctions serverless. Les limites critiques doivent aussi etre configurees
// dans le Firewall Vercel lorsque le trafic justifie une protection distribuee.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const STORE_MAX = 50_000;
const CLEANUP_INTERVAL_MS = 60_000;
const store = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }

  while (store.size > STORE_MAX) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function check(key: string, limit: number, windowMs: number): Response | null {
  const now = Date.now();
  cleanup(now);

  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count += 1;
  if (entry.count <= limit) return null;

  return new Response(JSON.stringify({ error: 'Trop de requetes. Veuillez reessayer.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))),
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(entry.resetAt),
      'X-RateLimit-Source': 'memory',
    },
  });
}

/** Retourne une reponse 429 lorsque la limite locale est depassee. */
export async function rateLimit(
  key: string,
  limit: number = 20,
  windowMs: number = 60_000
): Promise<Response | null> {
  return check(key, limit, windowMs);
}

/** Rate-limit scope a une route et une IP. */
export async function rateLimitRoute(
  ip: string,
  route: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  return rateLimit(`${route}:${ip}`, limit, windowMs);
}
