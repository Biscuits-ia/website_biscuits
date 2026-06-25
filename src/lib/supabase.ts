// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

function resolvePublishableKey(): string {
  const publishable = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon        = import.meta.env.SUPABASE_ANON_KEY;
  const key = (typeof publishable === 'string' && publishable.length > 0)
    ? publishable
    : (typeof anon === 'string' && anon.length > 0 ? anon : '');
  if (!key) throw new Error('[supabase] Aucune cle publique trouvee (PUBLIC_SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY).');
  return key;
}

/**
 * Client SSR principal — Vercel/serverless safe.
 *
 * ROOT CAUSE de "refresh_token_not_found" :
 *   Vercel parallélise plusieurs lambdas sur la même page (HTML + prefetch
 *   router + assets). Toutes reçoivent le même Cookie avec le même
 *   refresh_token. Si deux d'entre elles déclenchent un refresh
 *   (access_token expiré), la première consomme le token, la deuxième
 *   reçoit 400 refresh_token_not_found.
 *
 * FIX : autoRefreshToken: false + persistSession: false.
 *   On désactive tout refresh implicite côté serveur. Le middleware
 *   (middleware.ts) gère le refresh de manière explicite et contrôlée,
 *   une seule fois, en appelant refreshSessionIfNeeded(). Les routes
 *   API protégées appellent getUser() directement (JWT déjà frais grâce
 *   au refresh fait par le middleware sur la requête HTML précédente).
 *
 * NOTE : le refresh côté client (browser) reste géré par le SDK Supabase
 *   JS chargé dans le navigateur — aucun impact ici.
 */
export function createSupabaseClient(context: { request: Request; cookies: any }) {
  const url = import.meta.env.SUPABASE_URL;
  if (!url) throw new Error('[supabase] SUPABASE_URL manquant dans .env.');

  return createServerClient(
    url,
    resolvePublishableKey(),
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.request.headers.get('Cookie') ?? '')
            .filter((c) => c.name)
            .map((c) => ({ name: c.name, value: c.value ?? '' }));
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            context.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: import.meta.env.PROD,
              sameSite: 'lax',
              path: '/',
            });
          }
        },
      },
      auth: {
        // CRITIQUE : false pour éviter tout refresh implicite entre lambdas.
        // Le middleware gère le refresh explicitement via refreshSessionIfNeeded().
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Tente de rafraîchir la session si l'access token est expiré.
 * À appeler UNE SEULE FOIS par requête, dans le middleware uniquement.
 * Retourne true si la session est valide (fraîche ou rafraîchie).
 *
 * Pourquoi ici et pas dans getUser() ?
 *   getUser() fait un round-trip Auth systématique même avec un token frais.
 *   On économise un appel réseau sur ~95% des requêtes (token valide 1h).
 *   Le refresh n'a lieu que si le token est effectivement expiré.
 */
export async function refreshSessionIfNeeded(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<boolean> {
  // getSession() lit les cookies localement, sans appel réseau.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;

  // Marge de 60 s : on refresh légèrement avant expiration pour éviter
  // qu'un token expire pendant le traitement de la requête.
  if (expiresAt > nowSec + 60) {
    // Token encore valide, pas de refresh nécessaire.
    return true;
  }

  // Token expiré (ou proche) : on refresh explicitement.
  // C'est le SEUL endroit où un refresh réseau peut se produire côté serveur.
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    // refresh_token_not_found ou token révoqué : session invalide.
    console.warn('[supabase] refreshSessionIfNeeded failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Client Supabase avec service_role : bypass RLS.
 * Uniquement côté serveur. Ne jamais exposer au browser.
 */
export function createSupabaseAdminClient(_ctx?: unknown) {
  const url    = import.meta.env.SUPABASE_URL;
  const svcKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) throw new Error('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');

  return createClient(url, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}