// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * Resolution de la cle publique Supabase cote client.
 * Prefere la nouvelle Publishable Key (format 2024+, prefixe PUBLIC_) si
 * definie, sinon retombe sur l'ancienne anon key pour retrocompatibilite.
 * Les deux sont safe-by-design : leur securite repose sur les RLS policies.
 */
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
 * Client SSR principal.
 * Lit les cookies de session, ecrit les nouveaux via Astro.cookies.
 * Utilise par toutes les routes Astro et API en SSR.
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
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/**
 * Client Supabase avec service_role : bypass RLS.
 * Uniquement cote serveur (routes API, lib/auth.ts).
 * Ne jamais exposer ce client au client browser.
 */
export function createSupabaseAdminClient(_ctx?: unknown) {
  const url     = import.meta.env.SUPABASE_URL;
  const svcKey  = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env\n' +
      'Recupere la cle dans Supabase > Project Settings > API > service_role secret.',
    );
  }

  return createClient(url, svcKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}