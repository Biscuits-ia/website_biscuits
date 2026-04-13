// src/pages/api/ateliers/inscrire.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString }        from '@/types/ateliers';

/** Shape attendu de la vue `workshop_sessions_with_seats` */
interface SessionWithSeats {
  seats_left: number;
}

/** Type guard : vérifie que la réponse Supabase est une SessionWithSeats valide */
function isSessionWithSeats(value: unknown): value is SessionWithSeats {
  return (
    typeof value === 'object' &&
    value !== null &&
    'seats_left' in value &&
    typeof (value as SessionWithSeats).seats_left === 'number'
  );
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form      = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!sessionId) {
    return new Response('session_id requis', { status: 400 });
  }

  // ── Vérifier les places disponibles ─────────────────────────────────────────
  const { data: sessionRaw, error: fetchError } = await supabase
    .from('workshop_sessions_with_seats')
    .select('seats_left')
    .eq('id', sessionId)
    .single();

  if (fetchError) {
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent(fetchError.message),
    );
  }

  if (!isSessionWithSeats(sessionRaw) || sessionRaw.seats_left <= 0) {
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent('Session complète.'),
    );
  }

  // ── Inscription ──────────────────────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from('workshop_registrations')
    .insert({ session_id: sessionId, user_id: user.id });

  if (insertError) {
    const message =
      insertError.code === '23505'
        ? 'Vous êtes déjà inscrit.'
        : insertError.message;
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent(message),
    );
  }

  // ── TODO: envoyer email de confirmation (Supabase Edge Function) ──────────────

  return redirect('/dashboard/user/ateliers?saved=1');
};