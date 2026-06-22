// src/pages/auth/delete-account.ts
// Supprime le compte de l'utilisateur courant via Supabase Auth Admin API.
// Accepte GET (pour le bouton de `user/settings.astro`) et POST (futur form).
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { deleteUserFromSupabase } from '@/lib/auth';

async function handleDelete(Astro: Parameters<APIRoute>[0]): Promise<Response> {
  const supabase = createSupabaseClient(Astro);

  // 1) Vérifier que l'utilisateur est connecté
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Astro.redirect('/connexion?error=' + encodeURIComponent('Vous devez être connecté pour supprimer votre compte.'));
  }

  // 2) Anonymiser la trace côté profiles (RGPD) AVANT de supprimer le user
  //    Si l'auth admin échoue, on garde au moins la cohérence fonctionnelle.
  try {
    const adminDb = createSupabaseAdminClient();
    await adminDb
      .from('profiles')
      .update({
        full_name: null,
        avatar_url: null,
        // Garde l'email pour traçabilité RGPD mais marque le compte
      })
      .eq('id', user.id);
  } catch (e) {
    console.error('[auth/delete-account] anonymization failed:', e);
  }

  // 3) Déconnecter les sessions actives (cookies)
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (e) {
    console.error('[auth/delete-account] signOut failed:', e);
  }

  // 4) Supprimer le user de Supabase Auth (cascades via FK vers profiles)
  const deleted = await deleteUserFromSupabase(user.id);
  if (!deleted) {
    return Astro.redirect('/?error=' + encodeURIComponent('La suppression a échoué. Réessaie ou contacte le support.'));
  }

  // 5) Purge cookies Supabase (best effort)
  try {
    Astro.cookies.delete('sb-access-token', { path: '/' });
    Astro.cookies.delete('sb-refresh-token', { path: '/' });
  } catch {
    // ignore
  }

  return Astro.redirect('/?deleted=1');
}

export const GET: APIRoute = async (Astro) => handleDelete(Astro);
export const POST: APIRoute = async (Astro) => handleDelete(Astro);
