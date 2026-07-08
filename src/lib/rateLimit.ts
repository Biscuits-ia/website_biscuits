// src/lib/rateLimit.ts
//
// Rate limiter DISTRIBUE pour les routes API.
//
// POURQUOI UPSTASH (audit §7, CRITIQUE 4-5)
// -------------------------------------------
// L'ancien Map en memoire etait trivialement contournable : avec N instances
// Vercel concurrentes, la limite effective etait `5 x N` par minute, et un cold
// start la remettait a zero. La consequence pratique : un attaquant pouvait
// brute-forcer /auth/connexion a 100 000 requetes/min sans declencher le rate
// limit, simplement en falsifiant l'IP source (cf. audit P1-3 et P1-4).
//
// Upstash Redis (REST) fournit un compteur partage entre toutes les instances,
// avec un algorithme de sliding window qui resiste aux rafales.
//
// FALLBACK GRACIEUX
// -----------------
// Si Upstash est indisponible (panne, cle d'env manquante, timeout), on
// LAISSE PASSER la requete plutot que de bloquer. C'est le defaut d'une
// degradation acceptable : mieux vaut risquer un abus ponctuel qu'un site
// completement coupe par une panne d'un service tiers. Le Map en memoire
// conserve un role de cache L1 (1 s) pour absorber les bursts sans marteler
// Upstash.
//
// LIMITES ACTUELLES
// -----------------
// Les valeurs exactes (5/min sur /auth/connexion, etc.) sont dans le middleware
// -- ce module est un PRIMITIVE bas-niveau qui prend (key, limit, windowMs).

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Cache L1 en memoire : pour eviter de marteler Upstash sur les bursts,
// on garde 1 seconde de memoire locale. Au-dela, on demande a Upstash.
const L1_CACHE_TTL_MS = 1_000;
const L1_STORE_MAX = 50_000; // Plafond dur : eviction FIFO.
const L1_CLEANUP_INTERVAL_MS = 60_000;
const l1Store = new Map<string, RateLimitEntry>();
let l1LastCleanup = Date.now();

function l1Cleanup(): void {
  const now = Date.now();
  if (now - l1LastCleanup < L1_CLEANUP_INTERVAL_MS) return;
  l1LastCleanup = now;
  for (const [k, v] of l1Store) {
    if (v.resetAt <= now) l1Store.delete(k);
  }
  // Eviction FIFO si on depasse le plafond.
  while (l1Store.size > L1_STORE_MAX) {
    const oldest = l1Store.keys().next().value;
    if (oldest === undefined) break;
    l1Store.delete(oldest);
  }
}

function l1Check(key: string, limit: number, windowMs: number): Response | null {
  l1Cleanup();
  const now = Date.now();
  const entry = l1Store.get(key);
  if (!entry || now > entry.resetAt) {
    l1Store.set(key, { count: 1, resetAt: now + L1_CACHE_TTL_MS });
    return null; // L1 miss : on demande a Upstash.
  }
  entry.count++;
  if (entry.count > limit) {
    return new Response(
      JSON.stringify({ error: 'Trop de requetes. Veuillez reessayer.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '1',
          'X-RateLimit-Source': 'l1',
        },
      },
    );
  }
  return null;
}

// ─── Client Upstash (lazy) ──────────────────────────────────────────────────
//
// On n'instancie Redis et Ratelimit qu'a la PREMIERE utilisation, pour ne pas
// ralentir le cold start Vercel. Si les variables d'env sont absentes,
// `getLimiter()` retourne null et on tombe en mode "L1 only".

let cachedLimiter: Ratelimit | null | undefined; // undefined = pas initialise.

function getLimiter(): Ratelimit | null {
  if (cachedLimiter !== undefined) return cachedLimiter;

  const url = import.meta.env.UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      '[rateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN absents : ' +
      'rate limit distribue desactive, fallback L1 in-memory uniquement.',
    );
    cachedLimiter = null;
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    // Sliding window : plus robuste que fixed window sur les rafales en
    // bordure de fenetre (un attaquant ne peut pas envoyer `2*limit` en
    // pressant juste avant et juste apres un tick).
    cachedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '1 s'),
      analytics: false,
      prefix: 'biscuits-ia:rl',
    });
    return cachedLimiter;
  } catch (err) {
    console.error('[rateLimit] Echec d\'initialisation Upstash :', err);
    cachedLimiter = null;
    return null;
  }
}

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Verifie si la cle a depasse la limite. Retourne un `Response 429` si oui,
 * `null` si la requete peut continuer.
 *
 * @param key     Cle d'isolation (ex: `${ip}:${pathname}`).
 * @param limit   Nombre max de requetes dans la fenetre.
 * @param windowMs Largeur de la fenetre en millisecondes.
 */
export async function rateLimit(
  key: string,
  limit: number = 20,
  windowMs: number = 60_000,
): Promise<Response | null> {
  // 1. Cache L1 (gratuit, 1 s) : bloque les rafales sans toucher le reseau.
  const l1 = l1Check(key, limit, windowMs);
  if (l1) return l1;

  // 2. Rate limit distribue via Upstash.
  const limiter = getLimiter();
  if (!limiter) return null; // Upstash non configure : fallback "laisse passer".

  try {
    // Upstash `slidingWindow(limit, window)` : on convertit windowMs en secondes.
    // Note : on instancie un nouveau Ratelimit avec la bonne fenetre, parce que
    // le sliding window est fixe a la construction. Cela cree un objet par
    // appel -- c'est leger (juste une config), et on garde le prefix partage
    // pour le namespace Redis.
    const dynamicLimiter = new Ratelimit({
      redis: (limiter as unknown as { redis: Redis }).redis,
      limiter: Ratelimit.slidingWindow(limit, `${Math.max(1, Math.round(windowMs / 1000))} s`),
      analytics: false,
      prefix: 'biscuits-ia:rl',
    });

    const { success, limit: rlLimit, remaining, reset } = await dynamicLimiter.limit(key);

    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return new Response(
        JSON.stringify({ error: 'Trop de requetes. Veuillez reessayer.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(rlLimit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
            'X-RateLimit-Source': 'upstash',
          },
        },
      );
    }
    return null;
  } catch (err) {
    // Upstash down : on laisse passer. C'est le fallback gracieux documente
    // en tete de fichier. On log pour qu'un humain puisse investiguer.
    console.error('[rateLimit] Upstash erreur, fallback laisse-passer :', err);
    return null;
  }
}

/**
 * Variante synchrone conservee pour les routes qui ne peuvent pas await.
 * Utilise UNIQUEMENT le cache L1 (in-memory) -- pas de protection distribuee.
 * A eviter : preferer `rateLimit()` partout.
 *
 * @deprecated Utilisez `rateLimit()` (async) dans les APIRoute handlers.
 */
export function rateLimitSync(
  key: string,
  limit: number = 20,
  windowMs: number = 60_000,
): Response | null {
  return l1Check(key, limit, windowMs);
}

/**
 * Rate-limit scope a une route + IP. Sucre syntaxique.
 *
 * @example
 *   const blocked = await rateLimitRoute(ip, '/api/contact', 5, 10 * 60_000);
 *   if (blocked) return blocked;
 */
export async function rateLimitRoute(
  ip: string,
  route: string,
  limit: number,
  windowMs: number,
): Promise<Response | null> {
  return rateLimit(`${route}:${ip}`, limit, windowMs);
}
