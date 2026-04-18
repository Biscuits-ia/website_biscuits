// src/lib/supabase.ts
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient(context: { request: Request; cookies: any }) {
  return createServerClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          // Utiliser context.cookies.getAll() plutôt que le header brut pour
          // voir les cookies mis à jour par le middleware (ex: token rafraîchi).
          return context.cookies.getAll();
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
    },
  );
}

/**
 * Client Supabase avec service_role — bypass RLS.
 * Uniquement côté serveur (routes API, lib/auth.ts).
 * Ne jamais exposer ce client au client browser.
 */
export function createSupabaseAdminClient() {
  const url     = import.meta.env.SUPABASE_URL;
  const svcKey  = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env\n' +
      'Récupère la clé dans Supabase → Project Settings → API → service_role secret.',
    );
  }

  return createClient(url, svcKey, {
    auth: {
      // Désactive la persistance de session — ce client est stateless côté serveur
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}