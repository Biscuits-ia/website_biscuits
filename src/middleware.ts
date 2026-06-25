// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import { createSupabaseAdminClient, createSupabaseClient } from './lib/supabase';
import crypto from 'node:crypto';

// TTL du cache `lastLogoutAt` : on evite un round-trip Supabase a chaque requete
// authentifiee (cf. AUDIT-FRESH.md e3.2). 30 s est suffisant : un logout explicite
// ne necessite pas une invalidation infra-milliseconde.
const LOGOUT_CACHE_TTL_MS = 30_000;

interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}

// Module-level cache, partitionne par user.id. Vercel serverless partage ce cache
// entre toutes les requetes du meme warm container (cold start = cache miss).
const logoutCache = new Map<string, LogoutCacheEntry>();

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

  const ip = getClientIpOrNull(context.request, context.clientAddress);
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

  // Endpoints RDV : protection contre les boucles de polling et le scraping.
  if (pathname === '/api/appointment-slots' || pathname === '/api/user-appointments') {
    limit = 30;
    windowMs = 60_000;
  }

  if (pathname.startsWith('/auth/')) {
    // FIX P0 1.5 : rate-limit strict sur les endpoints sensibles
    // (anti credential stuffing sur /connexion, anti pollueur sur /inscription).
    if (pathname === '/auth/connexion') {
      limit = 5;
      windowMs = 60_000; // 5 tentatives / min / IP
    } else if (pathname === '/auth/inscription') {
      limit = 5;
      windowMs = 60_000; // 5 inscriptions / min / IP
    } else if (
      pathname === '/auth/confirm'
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
        // Colonne absente : considere comme "pas de logout enregistre".
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
    //    a aucune claim du payload local.
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
  } catch (err) {
    console.error('[middleware] mustInvalidateSession exception:', err);
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const isProd = import.meta.env.PROD;
  const isDev = !isProd;
  const nonce = crypto.randomBytes(18).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);
  context.locals.supabase = supabase;

  const url = context.url;
  const pathname = url.pathname;

  // 1) Rate-limit par IP sur /api/* et /auth/* (avant toute logique metier).
  const rateLimitResponse = checkRouteRateLimit(context, isDev, pathname);
  if (rateLimitResponse) return rateLimitResponse;

  // 2) Invalidation de session si last_logout_at > iat du JWT.
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

  const response = await next();

  // CSP 3 : strict-dynamic permet aux scripts signes par nonce de charger
  // dynamiquement d'autres scripts. Pour les scripts externalises avec src=,
  // on garde une whitelist explicite comme filet de securite (UA anciens
  // ou mode rapport-only).
  const scriptSrc = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'strict-dynamic'`,
    'https://fonts.googleapis.com',
    'https://www.googletagmanager.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
  ];

  if (isDev) {
    // Filet de securite dev uniquement : scripts inline injectes apres le
    // patch HTML (HMR Vite, dev toolbar Astro, error overlay) executes
    // sans nonce. En prod on garde la CSP stricte nonce + strict-dynamic.
    scriptSrc.push('unsafe-inline');
  }
  // connect-src : strict-dynamic ne le couvre PAS, on le maintient a la main.
  const connectSrc = [
    `'self'`,
    'https://www.googletagmanager.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://*.supabase.co',
    // FIX P0 1.6 : on autorise explicitement l'API HelloAsso pour les
    // futurs appels client-side. Aujourd'hui tous les appels sont cote
    // serveur, mais autant preparer le terrain.
    'https://api.helloasso.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    // Cloudflare (email-decode + beacon analytics) + domaine site.
    'https://*.cloudflare.com',
    'https://biscuits-ia.com',
    'https://*.biscuits-ia.com',
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

  const scriptSrcElem = [
  `'self'`,
  `'nonce-${nonce}'`,
  'https://www.googletagmanager.com',
  'https://cdn.vercel-insights.com',
  'https://*.vercel.app',
  'https://*.googletagmanager.com',
  'https://vercel.live',
  'https://*.vercel.live',
  'https://biscuits-ia.com',
  'https://*.biscuits-ia.com',
];

  // FIX P0 1.4 : script-src-attr differencie dev/prod.
  // En dev, on autorise unsafe-inline (Vite/Astro toolbar/HMR).
  // En prod, on interdit les handlers inline (XSS defense in depth).
  const scriptSrcAttr = isDev ? `'self' 'unsafe-inline'` : `'none'`;

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `script-src-elem ${scriptSrcElem.join(' ')}`,
    `script-src-attr ${scriptSrcAttr}`,
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
      if (/\bnonce\s*=/.test(attrs)) {
        return match;
      }
      // Ajoute le nonce a TOUS les scripts (inline + externes).
      // Avec strict-dynamic dans script-src, le nonce est necessaire pour
      // que les scripts inline puissent charger d'autres scripts dynamiquement.
      return `<script${attrs} nonce="${nonce}">`;
    });
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
