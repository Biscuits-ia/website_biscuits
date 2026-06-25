// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

function resolvePublishableKey(): string {
  const publishable = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon        = import.meta.env.SUPABASE_ANON_KEY;

  const key = (typeof publishable === 'string' && publishable.length > 0)
    ? publishable
    : (typeof anon === 'string' && anon.length > 0 ? anon : '');

  if (!key) {
    throw new Error(
      '[supabase] Aucune cle publique Supabase trouvee. ' +
      'Definir PUBLIC_SUPABASE_PUBLISHABLE_KEY (format 2024+) ou SUPABASE_ANON_KEY dans .env.',
    );
  }
  return key;
}

/**
 * Client SSR principal — Vercel-safe.
 *
 * PROBLÈME RÉSOLU : "refresh_token_not_found" sur Vercel.
 *
 * Vercel peut exécuter plusieurs lambdas quasi-simultanément (prefetch,
 * assets, navigation). Si deux lambdas reçoivent le même refresh token
 * et appellent toutes les deux getUser() → l'une consomme le token,
 * l'autre arrive trop tard → 400 refresh_token_not_found.
 *
 * Solution en deux volets :
 *
 * 1. On laisse autoRefreshToken: true (défaut SDK). Le SDK gère le cycle
 *    de vie des tokens proprement, y compris l'écriture des nouveaux cookies
 *    via setAll() dès que le refresh est fait — avant que la réponse parte.
 *    Avec autoRefreshToken: false, le middleware appelait getUser() qui
 *    déclenchait un refresh interne non géré, les cookies n'étaient pas
 *    mis à jour, et la prochaine lambda arrivait avec l'ancien token révoqué.
 *
 * 2. On NE SUPPRIME PAS detectSessionInUrl: false pour le callback OAuth
 *    (/auth/callback), qui en a besoin. On garde false partout ailleurs
 *    pour éviter que le SDK parse les hash fragments côté serveur (inutile
 *    et potentiellement confusant).
 *
 * Note sur la sécurité : autoRefreshToken: true côté serveur est sûr car
 * le client SSR est recréé à chaque requête — il n'y a pas de timer
 * persistant entre les lambdas. Le refresh ne se produit que si le SDK
 * détecte un token expiré lors de getUser().
 */
export function createSupabaseClient(context: { request: Request; cookies: any }) {
  const url = import.meta.env.SUPABASE_URL;
  if (!url) throw new Error('[supabase] SUPABASE_URL manquant dans .env.');

  const isCallbackRoute = new URL(context.request.url).pathname === '/auth/callback';

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
              // strict pour les routes sensibles, lax ailleurs.
              // lax est nécessaire pour que les cookies soient envoyés lors
              // d'une navigation top-level (OAuth callback, magic link).
              sameSite: 'lax',
              path: '/',
            });
          }
        },
      },
      auth: {
        // FIX : laisser le SDK gérer le refresh → cookies mis à jour dans
        // la même réponse, pas de race condition entre lambdas.
        autoRefreshToken: true,
        // detectSessionInUrl uniquement sur /auth/callback (hash fragment OAuth).
        // Partout ailleurs : false pour éviter des appels inutiles.
        detectSessionInUrl: isCallbackRoute,
        // persistSession: false sur serveur = ne pas stocker en mémoire entre
        // requêtes (chaque lambda est stateless de toute façon).
        persistSession: false,
      },
    },
  );
}

/**
 * Client Supabase avec service_role : bypass RLS.
 * Uniquement côté serveur (routes API, lib/auth.ts).
 * Ne jamais exposer ce client au client browser.
 */
export function createSupabaseAdminClient(_ctx?: unknown) {
  const url    = import.meta.env.SUPABASE_URL;
  const svcKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env\n' +
      'Recupere la cle dans Supabase > Project Settings > API > service_role secret.',
    );
  }

  return createClient(url, svcKey, {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
    },
  });
}