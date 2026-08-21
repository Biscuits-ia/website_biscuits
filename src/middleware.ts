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
import { createSupabaseClient } from './lib/supabase';
import { logError, requestContext } from './lib/observability';
import crypto from 'node:crypto';

// ─── Rate-limit ───────────────────────────────────────────────────────────────

async function checkRouteRateLimit(
  context: { request: Request; clientAddress?: string },
  isDev: boolean,
  pathname: string
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
const SERVER_TO_SERVER_PATHS = new Set(['/api/cron/aggregate-downloads', '/api/indexnow']);
const NOINDEX_PATHS = new Set([
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialisation-mot-de-passe',
  '/verifier-code-inscription',
  '/verifier-code-reinitialisation',
]);

function mustNotBeIndexed(pathname: string): boolean {
  return (
    NOINDEX_PATHS.has(pathname) ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/dashboard/')
  );
}

function isInvalidMutationOrigin(
  request: Request,
  pathname: string,
  expectedOrigin: string
): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (SERVER_TO_SERVER_PATHS.has(pathname)) return false;

  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedOrigin) return true;

  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === 'cross-site' || fetchSite === 'same-site';
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
      'ws://127.0.0.1:4321'
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

  // 1. Toute mutation navigateur doit provenir de l'origine exacte. Les routes
  // serveur-a-serveur exclues ici verifient leur secret dans leur handler.
  if (isInvalidMutationOrigin(context.request, pathname, context.url.origin)) {
    return new Response(JSON.stringify({ error: 'Origine de requete refusee.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Rate-limit local borne. Le Firewall Vercel peut completer cette
  // protection avec des regles distribuees sans dependance applicative.
  const rl = await checkRouteRateLimit(context, isDev, pathname);
  if (rl) return rl;

  // 3. L'autorisation reste appliquee dans les routes par requireAuth/
  // requireAdmin. Ne pas dupliquer getUser() ici evite un appel reseau et
  // supprime l'ancien mode fail-open central.

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
    logError(
      '[middleware] erreur non geree pendant le rendu',
      err,
      requestContext(context.request)
    );
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
  if (mustNotBeIndexed(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});
