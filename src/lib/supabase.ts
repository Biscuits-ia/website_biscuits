// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * Résolution de la clé publique Supabase côté client.
 * Préfère la nouvelle Publishable Key (format 2024+, préfixe PUBLIC_) si
 * définie, sinon retombe sur l’ancienne anon key pour rétrocompatibilité.
 * Les deux sont safe-by-design : leur sécurité repose sur les RLS policies.
 */
function resolvePublishableKey(): string {
  const publishable = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon        = import.meta.env.SUPABASE_ANON_KEY;

  const key = (typeof publishable === 'string' && publishable.length > 0)
    ? publishable
    : (typeof anon === 'string' && anon.length > 0 ? anon : '');

  if (!key) {
    throw new Error(
      '[supabase] Aucune clé publique Supabase trouvée. ' +
      'Définir PUBLIC_SUPABASE_PUBLISHABLE_KEY (format 2024+) ou SUPABASE_ANON_KEY dans .env.',
    );
  }
  return key;
}

/**
 * Client SSR principal.
 * Lit les cookies de session, crit les nouveaux via Astro.cookies.
 * Utilisé par toutes les routes Astro et API en SSR.
 */
export function createSupabaseClient(context: { request: Request; cookies: any }) {
  const url = import.meta.env.SUPABASE_URL;
  if (!url) {
    throw new Error('[supabase] SUPABASE_URL manquant dans .env.');
  }

  return createServerClient(
    url,
    resolvePublishableKey(),
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.request.headers.get('Cookie') ?? '')
            .filter((cookie) => cookie.name)
            .map((cookie) => ({ name: cookie.name, value: cookie.value ?? '' }));
        },
        setAll(cookiesToSet) {
          // IMPORTANT: Set cookies in BOTH the Astro.cookies API AND return them
          // for the response. This ensures cookies work in SSR mode with Vercel.
          for (const { name, value, options } of cookiesToSet) {
            context.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: import.meta.env.PROD,
              sameSite: 'lax',
              path: '/',
              // SECURITY: pas de `domain` ? cookie limit  l'hte exact.
              // Avant : `domain: '.biscuits-ia.com'` partageait le cookie
              // d'auth avec TOUS les sous-domaines ? si un sous-domaine
              // tait compromis, hijack de session possible. Cf. AUDIT 3.
            });
          }
        },
      },
      // Critical for SSR: disable auto-refresh in the client, handle it in middleware
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/**
 * Client Supabase avec service_role  bypass RLS.
 * Uniquement ct serveur (routes API, lib/auth.ts).
 * Ne jamais exposer ce client au client browser.
 */
export function createSupabaseAdminClient() {
  const url     = import.meta.env.SUPABASE_URL;
  const svcKey  = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env\n' +
      'Rcupre la cl dans Supabase ? Project Settings ? API ? service_role secret.',
    );
  }

  return createClient(url, svcKey, {
    auth: {
      // Dsactive la persistance de session  ce client est stateless ct serveur
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
