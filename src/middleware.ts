// src/middleware.ts
//
// Middleware Astro : rate-limit, guard de session, CSP.
//
// RÈGLE D'OR : côté serveur, on n'appelle QUE getUser(). Jamais getSession().
//
// getSession() lit le refresh_token depuis le cookie et PEUT déclencher
// un refresh si l'access_token est expiré — même avec autoRefreshToken: false.
// Si le browser SDK a fait la même chose 50ms avant, le token est révoqué
// → refresh_token_not_found.
//
// getUser() fait un appel réseau à Supabase Auth avec l'access_token.
// Si l'access_token est valide → retour immédiat, refresh_token non touché.
// Si l'access_token est expiré → Supabase Auth refuse → erreur → on déconnecte.
// Dans les deux cas, le refresh_token n'est JAMAIS consommé côté serveur.

import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import { createSupabaseClient, createSupabaseAdminClient } from './lib/supabase';
import crypto from 'node:crypto';

// ─── Cache logout (30 s) ──────────────────────────────────────────────────────

const LOGOUT_CACHE_TTL_MS = 30_000;
interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}
const logoutCache = new Map<string, LogoutCacheEntry>();

// ─── Routes publiques ─────────────────────────────────────────────────────────

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
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/favicon')) return true;
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

  if (pathname === '/api/appointment-slots' || pathname === '/api/user-appointments') limit = 30;

  if (pathname.startsWith('/auth/')) {
    if (pathname === '/auth/connexion' || pathname === '/auth/inscription') {
      limit = 5;
    } else if (
      ['/auth/confirm', '/auth/callback', '/auth/verifier-token-inscription'].includes(pathname)
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

// ─── Lecture last_logout_at (cache 30 s) ──────────────────────────────────────

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

/**
 * Vérifie que la session est valide et non invalidée par un logout récent.
 *
 * ✅ RÈGLE D'OR : UNIQUEMENT getUser() côté serveur.
 * getUser() = validation JWT réseau. Pas de refresh token consommé.
 * Si erreur ou pas d'utilisateur → 'unauthenticated'.
 * Si last_logout_at > now - 5min → 'invalidated' (logout récent).
 * Sinon → 'ok'.
 */
async function handleSessionGuard(
  supabase: ReturnType<typeof createSupabaseClient>,
  pathname: string,
): Promise<'ok' | 'invalidated' | 'unauthenticated'> {
  try {
    // ✅ getUser() = validation JWT réseau. Pas de refresh token consommé.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      // AuthApiError ici = access token invalide ou expiré.
      // On retourne 'unauthenticated' — pas d'erreur à logger, c'est normal.
      return 'unauthenticated';
    }

    // Vérification last_logout_at : si un logout a eu lieu dans les 5 dernières
    // minutes, on invalide la session par sécurité.
    const lastLogoutAtMs = await readLastLogoutAtMs(user.id);
    if (lastLogoutAtMs === null || lastLogoutAtMs === 0) return 'ok';

    const fiveMinAgo = Date.now() - 5 * 60_000;
    if (lastLogoutAtMs > fiveMinAgo) return 'invalidated';

    return 'ok';
  } catch (err) {
    console.error('[middleware] handleSessionGuard exception:', err);
    return 'ok'; // Fail-open.
  }
}

// ─── CSP ──────────────────────────────────────────────────────────────────────

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

  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
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
      'http://localhost:4321',
      'ws://localhost:4321',
      'http://127.0.0.1:4321',
      'ws://127.0.0.1:4321',
    );
  }

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `script-src-elem ${scriptSrcElem.join(' ')}`,
    `script-src-attr ${isDev ? `'self' 'unsafe-inline'` : `'none'`}`,
    `worker-src 'self' blob: https://www.googletagmanager.com https://*.googletagmanager.com`,
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

// ─── Middleware ───────────────────────────────────────────────────────────────

export const onRequest = defineMiddleware(async (context, next) => {
  const isDev = !import.meta.env.PROD;
  const nonce = crypto.randomBytes(18).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);
  context.locals.supabase = supabase;

  const { pathname } = context.url;

  // 1. Rate-limit.
  const rl = checkRouteRateLimit(context, isDev, pathname);
  if (rl) return rl;

  // 2. Guard de session (skip routes publiques).
  if (!isPublicPath(pathname)) {
    const guard = await handleSessionGuard(supabase, pathname);
    if (guard === 'invalidated') {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Session invalidée.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (pathname !== '/connexion') return context.redirect('/connexion?session=invalidee');
    }
    // 'unauthenticated' → les pages protégées gèrent via requireAuth().
  }

  // 3. Requête.
  const response = await next();

  // 4. CSP.
  const csp = buildCsp(nonce, isDev);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    const html = injectNonce(await response.text(), nonce);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
});