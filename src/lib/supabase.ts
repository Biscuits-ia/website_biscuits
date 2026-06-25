import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

function resolvePublishableKey(): string {
  const publishable = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon = import.meta.env.SUPABASE_ANON_KEY;
  const key =
    typeof publishable === 'string' && publishable.length > 0
      ? publishable
      : typeof anon === 'string' && anon.length > 0
        ? anon
        : '';
  if (!key) {
    throw new Error(
      '[supabase] Clé publique manquante (PUBLIC_SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY).',
    );
  }
  return key;
}

/**
 * Client SSR — seule source de vérité côté serveur.
 * Utilisé par le middleware et les guards d'authentification.
 */
export function createSupabaseClient(context: { request: Request; cookies: any }) {
  const url = import.meta.env.SUPABASE_URL;
  if (!url) throw new Error('[supabase] SUPABASE_URL manquant.');

  return createServerClient(url, resolvePublishableKey(), {
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
      autoRefreshToken: false, // Pas de timer background dans une lambda.
      detectSessionInUrl: false, // Inutile côté serveur (pas de hash fragment).
      persistSession: false, // Stateless : chaque lambda repart de zéro.
    },
  });
}

/**
 * Client service_role — bypass RLS.
 * Uniquement côté serveur. Ne jamais exposer au browser.
 */
export function createSupabaseAdminClient(_ctx?: unknown) {
  const url = import.meta.env.SUPABASE_URL;
  const svcKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) {
    throw new Error('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');
  }

  return createClient(url, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}