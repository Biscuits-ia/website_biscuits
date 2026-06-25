// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import {
  createSupabaseClient,
  createSupabaseAdminClient,
  refreshSessionIfNeeded,
} from './lib/supabase';
import crypto from 'node:crypto';

// ─── Cache logout ────────────────────────────────────────────────────────────
// TTL 30 s : évite un round-trip Supabase à chaque requête authentifiée.
const LOGOUT_CACHE_TTL_MS = 30_000;

interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}

const logoutCache = new Map<string, LogoutCacheEntry>();

// ─── Routes publiques ─────────────────────────────────────────────────────────
// Ne doivent JAMAIS déclencher la vérification de session :
// un cookie corrompu sur ces routes créerait une boucle redirect infinie.
const PUBLIC_AUTH_PATHS = new Set([
  '/connexion',
  '/inscription',
  '/auth/connexion',
  '/auth/inscription',
  '/auth/callback',
  '/auth/confirm',
  '/auth/verifier-token-inscription',
  '/auth/mot-de-passe-oublie',
  '/auth/reinitialiser-mot-de-passe',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_AUTH_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/_astro/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  return false;
}

// ─── Rate-limit ───────────────────────────────────────────────────────────────
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

  if (pathname === '/api/appointment-slots' || pathname === '/api/user-appointments') {
    limit = 30;
  }

  if (pathname.startsWith('/auth/')) {
    if (pathname === '/auth/connexion' || pathname === '/auth/inscription') {
      limit = 5;
    } else if (
      pathname === '/auth/confirm'
      || pathname === '/auth/callback'
      || pathname === '/auth/verifier-token-inscription'
    ) {
      limit = 30;
    } else if (pathname === '/auth/mot-de-passe-oublie') {
      limit = 10;
      windowMs = 5 * 60_000;
    } else {
      limit = 12;
    }
  }

  return rateLimit(`${ip}:${pathname}`, limit, windowMs);
}

// ─── Lecture last_logout_at ───────────────────────────────────────────────────
function readAccessTokenIssuedAtMs(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8'),
    ) as { iat?: unknown };
    if (typeof payload.iat !== 'number') return null;
    return payload.iat * 1000;
  } catch {
    return null;
  }
}

async function readLastLogoutAtMs(userId: string): Promise<number | null> {
  const cached = logoutCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.lastLogoutAtMs;

  let value: number | null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('last_logout_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      value = error.code === '42703' ? 0 : null;
      if (error.code !== '42703') console.error('[middleware] readLastLogoutAtMs:', error.message);
    } else {
      const ms = data?.last_logout_at ? Date.parse(data.last_logout_at) : 0;
      value = Number.isFinite(ms) ? ms : null;
    }
  } catch (err) {
    console.error('[middleware] readLastLogoutAtMs exception:', err);
    return null;
  }

  logoutCache.set(userId, { lastLogoutAtMs: value, expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS });
  return value;
}

// ─── Guard de session ─────────────────────────────────────────────────────────
//
// ARCHITECTURE ANTI-RACE-CONDITION pour Vercel :
//
// Le problème "refresh_token_not_found" vient de :
//   1. Vercel parallélise plusieurs lambdas sur la même page (HTML + prefetch).
//   2. Toutes reçoivent le même Cookie avec le même refresh_token.
//   3. Si l'access_token est expiré, chaque lambda déclenche un refresh.
//   4. La première réussit, les suivantes reçoivent 400.
//
// Solution : autoRefreshToken: false dans le SDK + refresh explicite UNE SEULE
// FOIS via refreshSessionIfNeeded() (dans supabase.ts). Cette fonction lit
// d'abord getSession() localement (pas de réseau), et ne fait un appel réseau
// que si le token est effectivement expiré.
//
// Ensuite, on vérifie le logout via last_logout_at SANS appeler getUser() —
// on lit le JWT déjà frais depuis getSession() (cache mémoire SDK).
// getUser() est réservé aux routes API critiques qui en ont besoin.
//
async function handleSessionGuard(
  supabase: ReturnType<typeof createSupabaseClient>,
  pathname: string,
): Promise<'ok' | 'invalidated' | 'no_session'> {
  try {
    // 1. Refresh si nécessaire (un seul appel réseau possible, contrôlé).
    const sessionValid = await refreshSessionIfNeeded(supabase);
    if (!sessionValid) return 'no_session';

    // 2. Lire la session depuis le cache SDK (pas d'appel réseau ici).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return 'no_session';

    // 3. Vérifier last_logout_at vs iat du JWT (cache mémoire 30 s).
    const issuedAtMs = readAccessTokenIssuedAtMs(session.access_token);
    if (issuedAtMs === null) return 'ok'; // Fail-open si on ne peut pas lire iat.

    const lastLogoutAtMs = await readLastLogoutAtMs(session.user.id);
    if (lastLogoutAtMs === null || lastLogoutAtMs === 0) return 'ok';

    return issuedAtMs <= lastLogoutAtMs ? 'invalidated' : 'ok';
  } catch (err) {
    console.error('[middleware] handleSessionGuard exception:', err);
    return 'ok'; // Fail-open.
  }
}

// ─── Construction CSP ─────────────────────────────────────────────────────────
function buildCsp(nonce: string, isDev: boolean): string {
  const EXTERNAL_SCRIPTS = [
    'https://www.googletagmanager.com',
    'https://*.googletagmanager.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://vercel.live',
    'https://*.vercel.live',
    'https://biscuits-ia.com',
    'https://*.biscuits-ia.com',
  ];

  // script-src : nonce + strict-dynamic (navigateurs modernes).
  // strict-dynamic ignore les whitelists URL → on les met dans script-src-elem.
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];

  // script-src-elem : fallback legacy sans strict-dynamic + whitelist domaines.
  const scriptSrcElem = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'sha256-3bzWVxQE32IZQKH9eh8KzyHuhXOlMrboDVVBRd0fWTU='`,
    ...EXTERNAL_SCRIPTS,
  ];

  if (isDev) {
    scriptSrc.push(`'unsafe-inline'`);
    scriptSrcElem.push(`'unsafe-inline'`);
  }

  const scriptSrcAttr = isDev ? `'self' 'unsafe-inline'` : `'none'`;

  const connectSrc = [
    `'self'`,
    'https://www.googletagmanager.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://*.supabase.co',
    'https://api.helloasso.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://*.cloudflare.com',
    'https://biscuits-ia.com',
    'https://*.biscuits-ia.com',
  ];

  if (isDev) {
    connectSrc.push(
      'http://localhost:4321', 'ws://localhost:4321',
      'http://127.0.0.1:4321', 'ws://127.0.0.1:4321',
    );
  }

  // GTM enregistre un Service Worker depuis googletagmanager.com.
  const workerSrc = [
    `'self'`,
    'blob:',
    'https://www.googletagmanager.com',
    'https://*.googletagmanager.com',
  ];

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `script-src-elem ${scriptSrcElem.join(' ')}`,
    `script-src-attr ${scriptSrcAttr}`,
    `worker-src ${workerSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src https://www.googletagmanager.com https://vercel.live`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

function injectNonce(html: string, nonce: string): string {
  return html.replaceAll(/<script\b([^>]*)>/g, (match, attrs: string) => {
    if (/\bnonce\s*=/.test(attrs)) return match;
    return `<script${attrs} nonce="${nonce}">`;
  });
}

// ─── Middleware principal ─────────────────────────────────────────────────────
export const onRequest = defineMiddleware(async (context, next) => {
  const isProd = import.meta.env.PROD;
  const isDev = !isProd;

  const nonce = crypto.randomBytes(18).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);
  context.locals.supabase = supabase;

  const { pathname } = context.url;

  // 1. Rate-limit par IP sur /api/* et /auth/*.
  const rateLimitResponse = checkRouteRateLimit(context, isDev, pathname);
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Guard de session (skip sur routes publiques pour éviter les boucles).
  if (!isPublicPath(pathname)) {
    const guardResult = await handleSessionGuard(supabase, pathname);

    if (guardResult === 'invalidated') {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      logoutCache.delete; // best-effort (pas d'accès au userId ici sans 2e round-trip)

      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Session invalidée. Merci de vous reconnecter.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (pathname !== '/connexion') {
        return context.redirect('/connexion?session=invalidee');
      }
    }
    // guardResult === 'no_session' : on laisse passer, les pages protégées
    // gèrent elles-mêmes la redirection via requireAuth() / requireRole().
  }

  // 3. Traitement de la requête.
  const response = await next();

  // 4. Injection CSP + nonce sur les réponses HTML.
  const csp = buildCsp(nonce, isDev);
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    const html = injectNonce(await response.text(), nonce);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
});