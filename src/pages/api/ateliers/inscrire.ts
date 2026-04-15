// src/pages/api/ateliers/inscrire.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString }        from '@/types/ateliers';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form      = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!sessionId) {
    return new Response('session_id requis', { status: 400 });
  }

  // ── Inscription atomique (empêche la race condition) ────────────────────────
  const { data: result, error: rpcError } = await supabase
    .rpc('atomic_workshop_register', {
      p_session_id: sessionId,
      p_user_id:    user.id,
    });

  if (rpcError) {
    console.error('[inscrire] Supabase RPC error:', rpcError.message);
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent('Erreur lors de l\'inscription.'),
    );
  }

  switch (result) {
    case 'SESSION_NOT_FOUND':
      return redirect(
        '/dashboard/user/ateliers?error=' + encodeURIComponent('Session introuvable.'),
      );
    case 'SESSION_FULL':
      return redirect(
        '/dashboard/user/ateliers?error=' + encodeURIComponent('Session complète.'),
      );
    case 'ALREADY_REGISTERED':
      return redirect(
        '/dashboard/user/ateliers?error=' + encodeURIComponent('Vous êtes déjà inscrit.'),
      );
  }

  // TODO: envoyer email de confirmation (Supabase Edge Function)

  return redirect('/dashboard/user/ateliers?saved=1');
};