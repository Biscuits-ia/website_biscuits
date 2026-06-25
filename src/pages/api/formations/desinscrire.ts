// ============================================================================
// src/pages/api/formations/desinscrire.ts
// ----------------------------------------------------------------------------
// Desinscription d''un utilisateur d''une session de formation.
// Meme logique que pour les ateliers, mais on respecte le statut
// (on ne desinscrit pas une formation deja "attended" par exemple).
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString } from '@/types/formations';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!sessionId) {
    return new Response('session_id manquant', { status: 400 });
  }

  // On annule (soft) -- on ne supprime pas, on passe le statut a "cancelled".
  // Cela preserve la trace comptable (paiements lies) et la coherence des stats.
  const { data: existing, error: fetchErr } = await supabase
    .from('training_registrations')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[formations/desinscrire] select error:', fetchErr.message);
    return redirect(
      `/dashboard/user/formations?error=${encodeURIComponent('Erreur lors de la desinscription.')}`,
    );
  }

  if (!existing) {
    return redirect(
      `/dashboard/user/formations?error=${encodeURIComponent('Inscription introuvable.')}`,
    );
  }

  // Si deja "attended" / "no_show" : on laisse l''admin gerer (pas d''auto-cancel).
  if (existing.status === 'attended' || existing.status === 'no_show') {
    return redirect(
      `/dashboard/user/formations?error=${encodeURIComponent('Cette inscription est terminee, contactez un admin.')}`,
    );
  }

  const { error } = await supabase
    .from('training_registrations')
    .update({ status: 'cancelled' })
    .eq('id', existing.id);

  if (error) {
    console.error('[formations/desinscrire] update error:', error.message);
    return redirect(
      `/dashboard/user/formations?error=${encodeURIComponent('Erreur lors de la desinscription.')}`,
    );
  }

  return redirect('/dashboard/user/formations?saved=1');
};