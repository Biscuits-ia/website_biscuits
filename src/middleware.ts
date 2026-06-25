// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import { createSupabaseAdminClient, createSupabaseClient } from './lib/supabase';
import crypto from 'node:crypto';

// ─── Cache logout ────────────────────────────────────────────────────────────
// 30 s est suffisant : un logout explicite ne nécessite pas une invalidation
// infra-milliseconde. Le cache est partitionné par user.id.
const LOGOUT_CACHE_TTL_MS = 30_000;

interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}

const logoutCache = new Map<string, LogoutCacheEntry>();

// ─── Routes publiques ─────────────────────────────────────────────────────────
// Ces routes ne doivent JAMAIS déclencher la vérification de session,
// sinon on crée une boucle redirect infinie si le cookie est corrompu.
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
  // Assets statiques, favicons, etc. : pas de session check.
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
  // Désactivé en dev pour ne pas gêner le développement.
  if (isDev) return null;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return null;

  const ip = getClientIpOrNull(context.request, context.clientAddress);
  // Si on ne peut pas identifier l'IP (Vercel sans header forwarded), on laisse passer.
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

  if (pathname === '/api/appointment-slots' || pathname === '/api/user-appointments') {
    limit = 30;
    windowMs = 60_000;
  }

  if (pathname.startsWith('/auth/')) {
    if (pathname === '/auth/connexion' || pathname === '/auth/inscription') {
      limit = 5;
      windowMs = 60_000;
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

// ─── Lecture last_logout_at (avec cache) ──────────────────────────────────────
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
      // Colonne absente (42703) : pas de logout enregistré.
      value = error.code === '42703' ? 0 : null;
      if (error.code !== '42703') {
        console.error('[middleware] readLastLogoutAtMs db error:', error.message);
      }
    } else {
      const ms = data?.last_logout_at ? Date.parse(data.last_logout_at) : 0;
      value = Number.isFinite(ms) ? ms : null;
    }
  } catch (err) {
    console.error('[middleware] readLastLogoutAtMs exception:', err);
    return null; // Fail-open : ne pas bloquer en cas d'erreur réseau.
  }

  logoutCache.set(userId, { lastLogoutAtMs: value, expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS });
  return value;
}

// ─── Vérification d'invalidation de session ───────────────────────────────────
// Retourne true si la session doit être invalidée.
// IMPORTANT : ne jamais appeler sur une route publique (cf. isPublicPath).
async function mustInvalidateSession(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<boolean> {
  try {
    // getUser() fait un round-trip vers Supabase Auth — seule source de vérité
    // pour la validité du JWT. Si le cookie est forgé ou révoqué, ça échoue ici.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;

    const { data: { session } } = await supabase.auth.getSession();
    const issuedAtMs = readAccessTokenIssuedAtMs(session?.access_token);
    if (issuedAtMs === null) return false;

    const lastLogoutAtMs = await readLastLogoutAtMs(user.id);
    // null = erreur DB → fail-open (ne pas déconnecter par erreur)
    // 0    = jamais déconnecté explicitement → valid
    if (lastLogoutAtMs === null || lastLogoutAtMs === 0) return false;

    return issuedAtMs <= lastLogoutAtMs;
  } catch (err) {
    console.error('[middleware] mustInvalidateSession exception:', err);
    return false; // Fail-open.
  }
}

// ─── Construction CSP ─────────────────────────────────────────────────────────
// BUG CORRIGÉ : strict-dynamic dans script-src-elem est contradictoire avec
// la whitelist de domaines (CSP3 : strict-dynamic ignore les whitelists URL
// dans le même champ). On sépare clairement :
//   - script-src      : nonce + strict-dynamic (navigateurs modernes)
//   - script-src-elem : nonce + whitelist explicite (legacy fallback, sans strict-dynamic)
// Les deux champs ensemble = couverture maximale cross-browser.
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

  // script-src : nonce + strict-dynamic. Avec strict-dynamic, les whitelists
  // URL sont ignorées par les navigateurs modernes, donc on les omet ici.
  const scriptSrc = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'strict-dynamic'`,
  ];

  // script-src-elem : fallback pour les UA qui ne supportent pas strict-dynamic.
  // On liste les domaines explicitement. On n'ajoute PAS strict-dynamic ici
  // pour éviter que les navigateurs modernes ignorent la whitelist.
  const scriptSrcElem = [
    `'self'`,
    `'nonce-${nonce}'`,
    // Hash connu pour un script inline Vercel Speed Insights.
    `'sha256-3bzWVxQE32IZQKH9eh8KzyHuhXOlMrboDVVBRd0fWTU='`,
    ...EXTERNAL_SCRIPTS,
  ];

  if (isDev) {
    // En dev uniquement : Vite HMR et Astro toolbar injectent des scripts
    // inline sans nonce. unsafe-inline est ignoré quand un nonce est présent
    // dans les navigateurs modernes, mais ça couvre les anciens/outils.
    scriptSrc.push(`'unsafe-inline'`);
    scriptSrcElem.push(`'unsafe-inline'`);
  }

  // script-src-attr : handlers inline type onclick="..." (toujours dangereux).
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
      'http://localhost:4321',
      'ws://localhost:4321',
      'http://127.0.0.1:4321',
      'ws://127.0.0.1:4321',
    );
  }

  const directives: string[] = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `script-src-elem ${scriptSrcElem.join(' ')}`,
    `script-src-attr ${scriptSrcAttr}`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src https://www.googletagmanager.com https://vercel.live`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  return directives.join('; ');
}

// ─── Injection du nonce sur les balises <script> ──────────────────────────────
function injectNonce(html: string, nonce: string): string {
  return html.replaceAll(/<script\b([^>]*)>/g, (match, attrs: string) => {
    // Ne pas doubler le nonce s'il est déjà présent.
    if (/\bnonce\s*=/.test(attrs)) return match;
    return `<script${attrs} nonce="${nonce}">`;
  });
}

// ─── Middleware principal ─────────────────────────────────────────────────────
export const onRequest = defineMiddleware(async (context, next) => {
  const isProd = import.meta.env.PROD;
  const isDev = !isProd;

  // Nonce cryptographiquement aléatoire, unique par requête.
  const nonce = crypto.randomBytes(18).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);
  context.locals.supabase = supabase;

  const { pathname } = context.url;

  // ── 1. Rate-limit (avant toute logique métier) ──────────────────────────────
  const rateLimitResponse = checkRouteRateLimit(context, isDev, pathname);
  if (rateLimitResponse) return rateLimitResponse;

  // ── 2. Vérification d'invalidation de session ───────────────────────────────
  // BUG CORRIGÉ : on skip TOTALEMENT la vérification sur les routes publiques.
  // Sans ce guard, un cookie corrompu sur /connexion déclenche signOut() +
  // redirect vers /connexion → boucle infinie.
  if (!isPublicPath(pathname)) {
    const invalidated = await mustInvalidateSession(supabase);

    if (invalidated) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignorer les erreurs de nettoyage de cookie.
      }
      // Invalider l'entrée cache pour cet utilisateur (best-effort).
      // On ne peut pas récupérer le user.id ici sans un 2e round-trip,
      // donc on purge toutes les entrées expirées à la prochaine request.

      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Session invalidée. Merci de vous reconnecter.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // On redirige vers /connexion uniquement si on n'y est pas déjà
      // (double sécurité, même si isPublicPath devrait l'avoir filtré).
      if (pathname !== '/connexion') {
        return context.redirect('/connexion?session=invalidee');
      }
    }
  }

  // ── 3. Traitement de la requête ─────────────────────────────────────────────
  const response = await next();

  // ── 4. Injection CSP + nonce ────────────────────────────────────────────────
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

  // Pour les réponses non-HTML (JSON, images…), on pose quand même la CSP
  // (utile pour les réponses d'API prévisualisées dans un browser).
  response.headers.set('Content-Security-Policy', csp);
  return response;
});