// src/middleware.ts
//
// Middleware Astro : rate-limit, guard de session, CSP.
//
// REGLE D'OR : cote serveur, on n'appelle QUE getUser(). Jamais getSession().
// On n'appelle SURTOUT PAS signOut()/refreshSession() cote serveur : ces
// methodes declenchent la token rotation et revoquent immediatement le
// refresh_token, ce qui produit les erreurs "refresh_token_not_found" des
// qu'un autre acteur (browser SDK, autre lambda) lit le meme cookie.
//
// getUser() fait un appel reseau a Supabase Auth avec l'access_token.
// Si l'access_token est valide -> retour immediat, refresh_token non touche.
// Si l'access_token est expire -> Supabase Auth refuse -> erreur -> on
// considere la session comme invalidee SANS toucher au refresh.

import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import { createSupabaseClient, createSupabaseAdminClient } from './lib/supabase';
import { logError, requestContext } from './lib/observability';
import crypto from 'node:crypto';

// ─── Cache logout (30 s, borne) ───────────────────────────────────────────────
//
// Une entree par userId vu. Sans borne, la Map croit indefiniment pour la duree
// de vie de l'instance -- et les instances Fluid Compute vivent longtemps. A
// l'echelle visee (millions de visiteurs) l'instance finit en OOM.
//
// Deux garde-fous :
//   1. purge des entrees expirees, au plus une fois par CLEANUP_INTERVAL_MS ;
//   2. plafond dur LOGOUT_CACHE_MAX : au-dela, on evince la plus ancienne
//      entree inseree (une Map JS conserve l'ordre d'insertion).

const LOGOUT_CACHE_TTL_MS = 30_000;
const LOGOUT_CACHE_MAX = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}
const logoutCache = new Map<string, LogoutCacheEntry>();
let lastLogoutCleanup = 0;

function setLogoutCache(userId: string, entry: LogoutCacheEntry): void {
  const now = Date.now();

  // Purge amortie des entrees expirees.
  if (now - lastLogoutCleanup > CLEANUP_INTERVAL_MS) {
    lastLogoutCleanup = now;
    for (const [key, value] of logoutCache) {
      if (value.expiresAt <= now) logoutCache.delete(key);
    }
  }

  // Plafond dur : eviction FIFO (la 1re clef iteree est la plus ancienne).
  if (!logoutCache.has(userId) && logoutCache.size >= LOGOUT_CACHE_MAX) {
    const oldest = logoutCache.keys().next().value;
    if (oldest !== undefined) logoutCache.delete(oldest);
  }

  logoutCache.set(userId, entry);
}

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

async function checkRouteRateLimit(
  context: { request: Request; clientAddress?: string },
  isDev: boolean,
  pathname: string,
): Promise<Response | null> {
  if (isDev) return null;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return null;

  const ip = getClientIpOrNull(context.request, context.clientAddress);
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

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

// ─── Garde CSRF (Sec-Fetch-Site) ──────────────────────────────────────────────
//
// Defense en profondeur, en complement de SameSite=lax sur les cookies.
//
// Les navigateurs modernes envoient `Sec-Fetch-Site` sur chaque requete : il
// decrit la relation entre l'origine de la page qui declenche la requete et
// celle de la ressource. Une soumission de formulaire cross-site (le vecteur
// CSRF classique) vaut `cross-site` ; une requete du site vers lui-meme vaut
// `same-origin`.
//
// On bloque UNIQUEMENT `cross-site` sur les methodes mutantes. Cas volontairement
// laisses passer :
//   - header ABSENT : requetes server-to-server (pg_cron, webhooks tiers).
//     Les headers Sec-Fetch-* sont poses par les navigateurs, jamais par curl
//     ni par un serveur -> un webhook legitime n'en a pas.
//   - `same-origin` / `same-site` / `none` : navigation directe, meme site.
//
// Un attaquant ne peut pas forger Sec-Fetch-* : ce sont des "forbidden header
// names", le navigateur les ecrit lui-meme et refuse toute surcharge par fetch/XHR.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isCrossSiteMutation(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  return request.headers.get('sec-fetch-site') === 'cross-site';
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

  setLogoutCache(userId, { lastLogoutAtMs: value, expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS });
  return value;
}

// ─── Guard de session ─────────────────────────────────────────────────────────

/**
 * Verifie que la session est valide et non invalidee par un logout recent.
 *
 * REGLE D'OR : UNIQUEMENT getUser() cote serveur.
 * getUser() = validation JWT reseau. Pas de refresh token consomme.
 * Si erreur ou pas d'utilisateur -> 'unauthenticated'.
 *
 * Si une deconnexion a eu lieu dans les 5 dernieres minutes, on considere
 * la session comme invalidee et on force la redirection vers /connexion
 * (SANS appeler signOut cote serveur -- celui-ci revoquerait le refresh).
 */
async function handleSessionGuard(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<'ok' | 'invalidated' | 'unauthenticated'> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      // AuthApiError ici = access token invalide ou expire.
      // On retourne 'unauthenticated' -- pas d'erreur a logger, c'est normal.
      return 'unauthenticated';
    }

    // Verification last_logout_at : si un logout a eu lieu dans les 5 dernieres
    // minutes, on invalide la session par securite.
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

// ─── CSP (routes SSR uniquement) ──────────────────────────────────────────────
//
// SUPPRIME LE 2026-07-08 : `injectNonce(html, nonce)`.
//
// Cette fonction parcourait le HTML de sortie en regex et apposait le nonce sur
// TOUS les <script>, y compris ceux qu'un attaquant venait d'injecter. Elle
// inversait le principe meme du nonce (seuls les scripts ecrits par le serveur
// le portent) et transformait toute injection HTML en XSS a execution garantie.
// Elle forcait aussi `await response.text()`, ce qui desactivait le streaming
// HTML d'Astro sur toutes les routes SSR.
//
// Le nonce est desormais passe explicitement : `nonce={Astro.locals.nonce}`.
//
// NB : cette fonction n'est appelee QUE pour les routes SSR. Les pages
// prerendered sont servies telles quelles par le CDN Vercel -- le middleware
// ne s'execute jamais a la requete. Leur CSP vient de vercel.json.

function buildCsp(nonce: string, isDev: boolean): string {
  // 'strict-dynamic' : les scripts charges par un script de confiance heritent
  // de la confiance. Les allowlists d'hotes sont alors ignorees par le
  // navigateur -- inutile de lister googletagmanager ici, GTM est injecte par
  // un script nonce.
  //
  // On ne declare PAS `script-src-elem` : cette directive PRIME sur `script-src`
  // pour les elements <script>, ce qui rendait le 'strict-dynamic' ci-dessous
  // totalement inerte dans l'ancienne version.
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (isDev) scriptSrc.push(`'unsafe-inline'`);

  const connectSrc = [
    `'self'`,
    'https://www.googletagmanager.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://cdn.vercel-insights.com',
    'https://*.supabase.co',
    'wss://*.supabase.co', // Realtime (chat projet) : WebSocket, pas https.
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
    // 'none' en prod : neutralise les handlers inline (onerror=, onclick=),
    // ce qui limite l'impact d'une injection HTML cote client.
    `script-src-attr ${isDev ? `'self' 'unsafe-inline'` : `'none'`}`,
    `worker-src 'self' blob:`,
    // 'unsafe-inline' requis : les dashboards utilisent des attributs style="".
    // Cf. astro.config.mjs pour le chemin de migration vers un CSP a hashes.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    // Inter est self-hostee : plus aucun besoin de fonts.gstatic.com.
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src https://www.googletagmanager.com https://vercel.live`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export const onRequest = defineMiddleware(async (context, next) => {
  const isDev = !import.meta.env.PROD;

  // 0. Pages prerendered.
  //
  // Le middleware s'execute pour elles UNE FOIS, AU BUILD -- puis plus jamais :
  // Vercel les sert en statique depuis le CDN. Y generer un nonce le figeait
  // dans le HTML, identique pour tous les visiteurs, a vie (verifie : le
  // dist/ contenait `nonce="zsP9agPmSxxQHYHSI1dlVbQ6"` sur les 129 pages).
  // Un nonce public et constant n'est pas un nonce.
  //
  // On ne pose donc NI nonce NI CSP ici : `nonce={Astro.locals.nonce}` rend
  // alors un attribut absent, et le CSP de ces pages vient de vercel.json.
  if (context.isPrerendered) {
    return next();
  }

  const nonce = crypto.randomBytes(18).toString('base64');
  context.locals.nonce = nonce;

  const supabase = createSupabaseClient(context);
  context.locals.supabase = supabase;

  const { pathname } = context.url;

  // 1. Garde CSRF : refuse les mutations declenchees cross-site.
  if (isCrossSiteMutation(context.request)) {
    return new Response(JSON.stringify({ error: 'Requete cross-site refusee.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Rate-limit (distribue via Upstash, avec fallback in-memory L1 + laissez-passer).
  const rl = await checkRouteRateLimit(context, isDev, pathname);
  if (rl) return rl;

  // 3. Guard de session (skip routes publiques).
  if (!isPublicPath(pathname)) {
    const guard = await handleSessionGuard(supabase);
    if (guard === 'invalidated') {
      // IMPORTANT : on ne fait PAS de signOut() cote serveur.
      // signOut() consomme le refresh_token et declenche la rotation,
      // ce qui peut revoquer la session d'un autre onglet / onduleur.
      // On laisse simplement le navigateur rediriger vers /connexion.
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Session invalidee.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (pathname !== '/connexion') return context.redirect('/connexion?session=invalidee');
    }
    // 'unauthenticated' -> les pages protegees gerent via requireAuth().
  }

  // 4. Requete.
  //
  // Observabilite (audit.md P2 #20) : on encapsule le rendu pour capturer les
  // erreurs non gerees avec leur contexte (methode + path) dans les Vercel
  // Runtime Logs. On RE-jette ensuite : le comportement (page 500 d'Astro)
  // reste identique -- on ajoute seulement une ligne de log exploitable.
  let response: Response;
  try {
    response = await next();
  } catch (err) {
    logError('[middleware] erreur non geree pendant le rendu', err, requestContext(context.request));
    throw err;
  }

  // 5. Headers no-cache emis par @supabase/ssr lors d'un setAll (cf.
  // lib/supabase.ts). On les recopie sur la reponse finale pour empecher
  // un CDN / proxy de cacher une reponse contenant un cookie de session.
  const extra = context.locals.__extraResponseHeaders;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      response.headers.set(k, v);
    }
  }

  // 6. CSP.
  //
  // On pose UNIQUEMENT le header, sans jamais lire le corps de la reponse.
  // L'ancienne version faisait `await response.text()` pour y injecter le nonce
  // en regex : cela bufferisait l'integralite du HTML et supprimait le streaming
  // d'Astro (TTFB = temps de rendu complet, au lieu de "des le <head>").
  response.headers.set('Content-Security-Policy', buildCsp(nonce, isDev));
  return response;
});