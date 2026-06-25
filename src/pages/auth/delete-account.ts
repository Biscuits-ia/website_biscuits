// src/pages/auth/delete-account.ts
//
// Supprime le compte de l'utilisateur courant via Supabase Auth Admin API.
// POST uniquement (le GET etait un vecteur CSRF : un <img src=...> pouvait
// detruire un compte sans interaction de l'utilisateur).
// Protection CSRF : on verifie que le header `Origin` matche le site publie.
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { deleteUserFromSupabase } from '@/lib/auth';

function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }
  // Fallback : on accepte si `sec-fetch-site: same-origin` est present.
  const secFetchSite = request.headers.get('sec-fetch-site');
  return secFetchSite === 'same-origin';
}

/**
 * Supprime les cookies de session Supabase poses par @supabase/ssr.
 *
 * Avec `cookies.encode: 'tokens-only'` (cf. lib/supabase.ts), les cookies
 * poses par @supabase/ssr sont `supabase.auth.token` et ses chunks
 * `.0`, `.1`, ... Les anciens cookies `sb-access-token` / `sb-refresh-token`
 * ne sont plus utilises : on les purge uniquement s'ils existent, par
 * securite (transitions).
 */
function purgeSupabaseAuthCookies(
  cookies: {
    delete: (name: string, options?: Record<string, unknown>) => void;
  },
): void {
  const names = ['supabase.auth.token'];
  for (let i = 0; i < 10; i++) {
    names.push(`supabase.auth.token.${i}`);
  }
  // Anciens cookies (compat ascendante)
  names.push('sb-access-token', 'sb-refresh-token');
  for (const name of names) {
    try {
      cookies.delete(name, { path: '/' });
    } catch {
      // ignore
    }
  }
}

async function handleDelete(Astro: Parameters<APIRoute>[0]): Promise<Response> {
  // 1) CSRF check : la requete POST doit venir du meme origine.
  if (!isSameOrigin(Astro.request, Astro.url)) {
    return new Response(
      JSON.stringify({ error: 'Origine de la requete invalide.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2) Reutiliser le client du middleware (meme session, pas de relecture
  //    concurrente des cookies).
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  // 3) Verifier que l'utilisateur est connecte
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Astro.redirect('/connexion?error=' + encodeURIComponent('Vous devez etre connecte pour supprimer votre compte.'));
  }

  // 4) Anonymiser la trace cote profiles (RGPD) AVANT de supprimer le user
  //    Si l'auth admin echoue, on garde au moins la coherence fonctionnelle.
  try {
    const adminDb = createSupabaseAdminClient();
    await adminDb
      .from('profiles')
      .update({
        full_name: null,
        avatar_url: null,
        // Garde l'email pour tracabilite RGPD mais marque le compte
      })
      .eq('id', user.id);
  } catch (e) {
    console.error('[auth/delete-account] anonymization failed:', e);
  }

  // 5) La suppression du user via auth.admin.deleteUser() invalide
  //    implicitement toutes ses sessions (les refresh_tokens lies sont
  //    revoques en cascade par Supabase Auth). On ne fait PAS de signOut()
  //    cote serveur ici -- ca consommerait un refresh_token en plus et
  //    peut creer une race condition avec d'autres onglets.

  // 6) Supprimer le user de Supabase Auth (cascades via FK vers profiles)
  const deleted = await deleteUserFromSupabase(user.id);
  if (!deleted) {
    return Astro.redirect('/?error=' + encodeURIComponent('La suppression a echoue. Reessaie ou contacte le support.'));
  }

  // 7) Purge des cookies de session (best effort).
  purgeSupabaseAuthCookies(Astro.cookies);

  return Astro.redirect('/?deleted=1');
}

export const POST: APIRoute = async (Astro) => handleDelete(Astro);