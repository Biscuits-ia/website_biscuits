// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AppSupabaseClient, Database } from './types';

export function createSupabaseClient(context: { request: Request; cookies: any }) {
  return createServerClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
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
              // Ensure cookies persist across subdomains if needed
              domain: import.meta.env.PROD ? '.biscuits-ia.com' : undefined,
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

// Helpers module tâches (compatibles stack actuelle)
function resolvePublicSupabaseUrl(): string {
  return import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
}

function resolvePublicSupabaseAnonKey(): string {
  return import.meta.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;
}

export function createServerSupabaseClient(context: { request: Request; cookies: any }): AppSupabaseClient {
  return createServerClient<Database>(
    resolvePublicSupabaseUrl(),
    resolvePublicSupabaseAnonKey(),
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
  ) as AppSupabaseClient;
}

let browserClient: AppSupabaseClient | null = null;

export function createBrowserSupabaseClient(): AppSupabaseClient {
  browserClient ??= createClient<Database>(
    resolvePublicSupabaseUrl(),
    resolvePublicSupabaseAnonKey(),
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  return browserClient;
}
