// src/pages/auth/delete-account.ts
//
// Supprime le compte de l'utilisateur courant via Supabase Auth Admin API.
// POST uniquement (le GET était un vecteur CSRF : un <img src=...> pouvait
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

async function handleDelete(Astro: Parameters<APIRoute>[0]): Promise<Response> {
  // 1) CSRF check : la requete POST doit venir du meme origine.
  if (!isSameOrigin(Astro.request, Astro.url)) {
    return new Response(
      JSON.stringify({ error: 'Origine de la requete invalide.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseClient(Astro);

  // 2) Verifier que l'utilisateur est connecte
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Astro.redirect('/connexion?error=' + encodeURIComponent('Vous devez etre connecte pour supprimer votre compte.'));
  }

  // 3) Anonymiser la trace cote profiles (RGPD) AVANT de supprimer le user
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

  // 4) Deconnecter les sessions actives (cookies)
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (e) {
    console.error('[auth/delete-account] signOut failed:', e);
  }

  // 5) Supprimer le user de Supabase Auth (cascades via FK vers profiles)
  const deleted = await deleteUserFromSupabase(user.id);
  if (!deleted) {
    return Astro.redirect('/?error=' + encodeURIComponent('La suppression a echoue. Reessaie ou contacte le support.'));
  }

  // 6) Purge cookies Supabase (best effort)
  try {
    Astro.cookies.delete('sb-access-token', { path: '/' });
    Astro.cookies.delete('sb-refresh-token', { path: '/' });
  } catch {
    // ignore
  }

  return Astro.redirect('/?deleted=1');
}

export const POST: APIRoute = async (Astro) => handleDelete(Astro);
