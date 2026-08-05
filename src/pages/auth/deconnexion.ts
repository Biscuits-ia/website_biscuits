// src/pages/auth/deconnexion.ts
//
// La deconnexion est une mutation : POST uniquement. Le scope local revoque la
// session courante sans deconnecter silencieusement les autres appareils.

import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async (context) => {
  // Reutiliser le client du middleware (meme session en memoire).
  const supabase = context.locals.supabase ?? createSupabaseClient(context);

  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (e) {
    console.error('[auth/deconnexion] signOut failed:', e);
    return new Response('Impossible de fermer la session.', { status: 500 });
  }

  return context.redirect('/connexion?deconnexion=1', 303);
};
