// src/lib/supabase.ts
//
// Clients Supabase : SSR (utilisateur) et Admin (service_role).
//
// REGLE D'OR (doc officielle Supabase SSR) :
// -> Cote serveur : UNIQUEMENT getUser(). Jamais getSession()/refreshSession().
// -> autoRefreshToken: false : pas de timer background dans une lambda.
// -> skipAutoInitialize: true : pas de _recoverAndRefresh() au constructeur.
// -> cookies.encode: 'tokens-only' : on ne stocke QUE les tokens dans le cookie.
//
// ROOT CAUSE de "refresh_token_not_found" :
// Supabase utilise la "token rotation" : chaque refresh genere un nouveau
// refresh_token et REVOQUE immediatement l'ancien. Si deux acteurs
// (browser SDK + serveur, ou deux lambdas Vercel) lisent le meme
// refresh_token et essaient de le consommer quasi-simultanement,
// le second recoit 400 refresh_token_not_found.
//
// Mesures appliquees :
// 1. autoRefreshToken: false : pas de ticker, pas de refresh auto.
// 2. persistSession: false : pas de session persistee cote serveur (stateless).
// 3. skipAutoInitialize: true : pas d'appel a _recoverAndRefresh() a la
//    construction (c'est lui qui declenche _callRefreshToken() quand
//    l'access_token approche de l'expiration).
// 4. flowType: 'implicit' : pas de code-verifier PKCE cote serveur.
// 5. cookies.encode = 'tokens-only' : on ne stocke QUE les tokens dans le
//    cookie, pas l'objet user. Ca evite le proxy userNotAvailableProxy et
//    reduit la taille du cookie (utile avec le chunking).
// 6. setAll recoit les headers de no-cache et les propage vers la reponse.
//    Un CDN ne doit JAMAIS cacher un cookie de session (fuite entre users).
//
// Doc officielle :
// https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=astro

import { createServerClient, parseCookieHeader, type CookieMethodsServer } from '@supabase/ssr';
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
      '[supabase] Cle publique manquante (PUBLIC_SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY).',
    );
  }
  return key;
}

/**
 * URL du projet Supabase.
 *
 * PUBLIC_SUPABASE_URL d'abord, SUPABASE_URL en fallback -- pour la meme raison
 * que resolvePublishableKey() : Astro n'inline dans le bundle que les variables
 * prefixees PUBLIC_. Les autres n'existent qu'au runtime serveur.
 *
 * Sans le prefixe, toute page `prerender = true` qui lit Supabase cassait au
 * BUILD avec "[supabase] SUPABASE_URL manquant" : elle s'execute pendant
 * `astro build`, ou seul le bundle est disponible.
 *
 * L'URL du projet n'est pas un secret (elle part dans chaque requete du
 * navigateur), donc l'exposer via PUBLIC_ ne change rien a la surface d'attaque.
 */
function resolveSupabaseUrl(): string {
  const publicUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serverUrl = import.meta.env.SUPABASE_URL;
  const url =
    typeof publicUrl === 'string' && publicUrl.length > 0
      ? publicUrl
      : typeof serverUrl === 'string' && serverUrl.length > 0
        ? serverUrl
        : '';
  if (!url) {
    throw new Error('[supabase] URL manquante (PUBLIC_SUPABASE_URL ou SUPABASE_URL).');
  }
  return url;
}

interface AstroCookiesLike {
  get: (name: string) => unknown;
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
  delete: (name: string, options?: Record<string, unknown>) => void;
}
interface AstroContextLike {
  request: Request;
  cookies: AstroCookiesLike;
  locals?: App.Locals & { __extraResponseHeaders?: Record<string, string> };
}

/**
 * Client SSR -- seule source de verite cote serveur.
 * Utilise par le middleware et les guards d'authentification.
 *
 * IMPORTANT : ce client NE doit PAS appeler signOut()/refreshSession()/getSession()
 * cote serveur -- il faut uniquement getUser() pour valider le JWT reseau.
 * Toute operation de mutation (signOut, updateUser, etc.) doit etre faite via
 * le client browser SDK ou via l'API Admin (service_role).
 */
export function createSupabaseClient(context: AstroContextLike) {
  const url = resolveSupabaseUrl();

  const cookieMethods: CookieMethodsServer = {
    // 'tokens-only' : on ne stocke QUE les tokens (access + refresh), pas
    // l'objet user. Reduit la taille du cookie, evite le proxy
    // userNotAvailableProxy et simplifie la purge.
    encode: 'tokens-only',
    getAll() {
      return parseCookieHeader(context.request.headers.get('Cookie') ?? '')
        .filter((c) => c.name)
        .map((c) => ({ name: c.name, value: c.value ?? '' }));
    },
    setAll(cookiesToSet, extraHeaders) {
      for (const { name, value, options } of cookiesToSet) {
        context.cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure: import.meta.env.PROD,
          sameSite: 'lax',
          path: '/',
        });
      }
      // Empeche un CDN / proxy inverse de cacher une reponse contenant
      // un cookie de session (sinon user A pourrait recevoir le token de user B).
      if (extraHeaders && context.locals) {
        if (!context.locals.__extraResponseHeaders) {
          context.locals.__extraResponseHeaders = {};
        }
        Object.assign(context.locals.__extraResponseHeaders, extraHeaders);
      }
    },
  };

  return createServerClient(url, resolvePublishableKey(), {
    cookies: cookieMethods,
    auth: {
      // Pas de timer background dans une lambda.
      autoRefreshToken: false,
      // Pas de detection de hash fragment cote serveur.
      detectSessionInUrl: false,
      // Stateless : chaque lambda repart de zero.
      persistSession: false,
      // CRITIQUE : on n'appelle PAS _recoverAndRefresh() au constructeur.
      // C'est lui qui declenche _callRefreshToken() quand l'access_token
      // approche de l'expiration, et donc la rotation/revocation du
      // refresh_token. La session n'est chargee qu'a la 1re methode
      // appelee explicitement (getUser). Cf. auth-js GoTrueClient L206.
      skipAutoInitialize: true,
      // Le flow PKCE est inutile cote serveur (on n'echange jamais un
      // code de verification ici : c'est fait cote client). On garde
      // 'implicit' pour eviter toute interference avec le code-verifier.
      flowType: 'implicit',
    },
  });
}

/**
 * Client service_role -- bypass RLS.
 * Uniquement cote serveur. Ne jamais exposer au browser.
 */
export function createSupabaseAdminClient(_ctx?: unknown) {
  const url = import.meta.env.SUPABASE_URL;
  const svcKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) {
    throw new Error('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');
  }

  return createClient(url, svcKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      skipAutoInitialize: true,
      detectSessionInUrl: false,
    },
  });
}