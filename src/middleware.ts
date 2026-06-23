// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { createSupabaseAdminClient, createSupabaseClient } from './lib/supabase';
import crypto from 'node:crypto';

// TTL du cache `lastLogoutAt` : on evite un round-trip Supabase e chaque requete
// authentifiee (cf. AUDIT-FRESH.md e3.2). 30 s est suffisant e un logout explicite
// ne necessite pas une invalidation infra-milliseconde.
const LOGOUT_CACHE_TTL_MS = 30_000;

interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}

// Module-level cache, partitionne par user.id. Vercel serverless partage ce cache
// entre toutes les requetes du meme warm container (cold start = cache miss).
const logoutCache = new Map<string, LogoutCacheEntry>();

function parseForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  return first;
}

function getClientIp(context: { request: Request; clientAddress?: string }): string | null {
  const headers = context.request.headers;
  const fromCf = headers.get('cf-connecting-ip');
  const fromRealIp = headers.get('x-real-ip');
  const fromForwarded = parseForwardedFor(headers.get('x-forwarded-for'));
  const fromAstro = typeof context.clientAddress === 'string' ? context.clientAddress : null;

  const ip = fromCf ?? fromRealIp ?? fromForwarded ?? fromAstro;
  if (!ip) return null;

  const normalized = ip.trim();
  if (!normalized || normalized === 'unknown') return null;
  return normalized;
}

function readAccessTokenIssuedAtMs(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { iat?: unknown };
    if (typeof payload.iat !== 'number') return null;
    return payload.iat * 1000;
  } catch {
    return null;
  }
}

function checkRouteRateLimit(
  context: { request: Request; clientAddress?: string },
  isDev: boolean,
  pathname: string,
): Response | null {
  if (isDev) return null;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return null;

  const ip = getClientIp(context);
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

  if (pathname.startsWith('/auth/')) {
    if (
      pathname === '/auth/inscription'
      || pathname === '/auth/confirm'
      || pathname === '/auth/callback'
      || pathname === '/auth/verifier-token-inscription'
    ) {
      limit = 30;
    } else if (pathname === '/auth/mot-de-passe-oublie') {
      windowMs = 5 * 60_000;
    } else {
      limit = 12;
    }
  }

  const key = `${ip}:${pathname}`;
  return rateLimit(key, limit, windowMs);
}

/**
 * Lit `profiles.last_logout_at` avec cache memoire (30 s).
 * Renvoie `null` si l'utilisateur n'a jamais logout explicitement.
 * Renvoie `0` si `last_logout_at` n'existe pas en BDD (colonne manquante).
 */
async function readLastLogoutAtMs(userId: string): Promise<number | null> {
  const cached = logoutCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.lastLogoutAtMs;
  }

  let value: number | null;
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from('profiles')
      .select('last_logout_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === '42703') {
        // Colonne absente e considere comme "pas de logout enregistre".
        value = 0;
      } else {
        console.error('[middleware] profile fetch for session invalidation failed:', error.message);
        return null;
      }
    } else if (!data?.last_logout_at) {
      value = 0;
    } else {
      const ms = Date.parse(data.last_logout_at);
      value = Number.isFinite(ms) ? ms : null;
    }
  } catch (err) {
    console.error('[middleware] readLastLogoutAtMs exception:', err);
    return null;
  }

  logoutCache.set(userId, {
    lastLogoutAtMs: value,
    expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS,
  });
  return value;
}

async function mustInvalidateSession(supabase: ReturnType<typeof createSupabaseClient>): Promise<boolean> {
  try {
    // 1. SECURITY: verify the JWT signature against Supabase FIRST.
    //    getUser() fait un round-trip serveur vers Supabase Auth; si le cookie
    //    est forge / non signe / revoque, l'appel echoue et on ne fait confiance
    //    e aucune claim du payload local.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;

    // 2. JWT serveur-verifie. Lecture du `iat` depuis le payload base64 safe.
    const { data: { session } } = await supabase.auth.getSession();
    const accessTokenIssuedAtMs = readAccessTokenIssuedAtMs(session?.access_token);
    if (accessTokenIssuedAtMs === null) return false;

    // 3. Comparaison `iat` vs `last_logout_at` (DB = source de verite du logout explicite).
    const lastLogoutAtMs = await readLastLogoutAtMs(user.id);
    if (lastLogoutAtMs === null || lastLogoutAtMs === 0) return false;
    return accessTokenIssuedAtMs <= lastLogoutAtMs;
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const isDev = import.meta.env.DEV;

  if (url.pathname === '/rss.xml') {
    return next();
  }

  const blocked = checkRouteRateLimit(context, isDev, url.pathname);
  if (blocked) return blocked;

  const nonce = crypto.randomBytes(16).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);

  const invalidatedSession = await mustInvalidateSession(supabase);

  if (invalidatedSession) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore cookie cleanup errors.
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Session invalidee. Merci de vous reconnecter.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!url.pathname.startsWith('/auth/')) {
      return context.redirect('/connexion?session=invalidee');
    }
  }

  context.locals.supabase = supabase;

  const response = await next();

  // CSP 3 + strict-dynamic. Un script signe par nonce peut charger
  // d'autres scripts dynamiquement sans whitelister chaque domain.
  // Recommandation CSP 2024+ pour les apps first-party.
  const scriptSrc = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'strict-dynamic'`,
    'https://fonts.googleapis.com',
  ];

  // connect-src : strict-dynamic ne le couvre PAS, on le maintient a la main.
  const connectSrc = [
    `'self'`,
    'https://www.googletagmanager.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://*.supabase.co',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];

  // frame-src : iframes (GTM noscript, Vercel live)
  const frameSrc = [
    'https://www.googletagmanager.com',
    'https://vercel.live',
  ];

  // img-src : https: pour visuels externes (open graph, etc.)
  const imgSrc = [
    `'self'`,
    'data:',
    'blob:',
    'https:',
  ];

  if (isDev) {
    connectSrc.push('http://localhost:4321', 'ws://localhost:4321', 'http://127.0.0.1:4321', 'ws://127.0.0.1:4321');
  }

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = html.replaceAll(/<script\b([^>]*)>/g, (match, attrs: string) => {
      if (/\bsrc\s*=/.test(attrs) || /\bnonce\s*=/.test(attrs)) {
        return match;
      }
      return `<script${attrs} nonce="${nonce}">`;
    });
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
