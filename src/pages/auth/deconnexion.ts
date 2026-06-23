// src/pages/auth/deconnexion.ts
//
// IMPORTANT : on marque `last_logout_at` AVANT `signOut()`.
// Sinon, un user multi-onglets peut rester connecte sur onglet 2 :
// le `iat` de l'access_token d'onglet 2 est anterieur au moment ou
// le middleware prend la nouvelle valeur `last_logout_at` (apres signOut).
//
// Le middleware compare `accessTokenIssuedAtMs <= lastLogoutAtMs` pour
// invalider la session. Si on ecrit last_logout_at APRES signOut, on a
// une fenetre ou le cookie est detruit cote onglet 1 mais pas encore
// invalide cote BDD, et onglet 2 reste actif.

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseClient(context);

  // 1) Lecture user + ecriture du timestamp AVANT signOut.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const adminSupabase = createSupabaseAdminClient();
      const { error } = await adminSupabase
        .from('profiles')
        .update({ last_logout_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) {
        console.error('[auth/deconnexion] failed to set last_logout_at:', error.message);
      }
    }
  } catch (error) {
    console.error('[auth/deconnexion] failed to mark logout timestamp:', error);
  }

  // 2) Puis signOut. Si l'etape 1 a echoue, on deconnecte quand meme.
  await supabase.auth.signOut({ scope: 'global' });

  return context.redirect('/connexion');
};

// Meme handler en GET pour permettre une deconnexion via un simple lien
// (utile depuis un email de notification par exemple).
export const GET = POST;