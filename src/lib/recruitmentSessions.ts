// src/lib/recruitmentSessions.ts
// Helpers partages par les vues publiques et admin des sessions de recrutement.

import { createSupabaseAdminClient } from '@/lib/supabase';

/**
 * Colonnes exposables publiquement. `created_by` (uuid d'un compte admin),
 * `created_at` et `updated_at` restent internes : `select('*')` les diffusait
 * a tout visiteur anonyme via /api/recruitment/sessions.
 */
export const PUBLIC_SESSION_COLUMNS =
  'id, title, description, scheduled_at, duration_minutes, location, max_candidates, status';

/**
 * Nombre de candidatures actives (hors `declined`) par session.
 *
 * Passe obligatoirement par le client admin : la policy
 * `recruitment_admin_select` reserve la lecture de `recruitment_submissions`
 * aux admins. Compte avec le client visiteur, la requete renvoyait zero ligne
 * sans erreur, donc `places_remaining` valait toujours `max_candidates` : les
 * sessions completes s'affichaient disponibles et le candidat se prenait un
 * refus au moment d'envoyer sa candidature.
 *
 * Seuls des agregats sortent d'ici, jamais de donnee nominative.
 */
export async function countActiveCandidatesBySession(
  sessionIds: string[],
): Promise<Record<string, number>> {
  if (sessionIds.length === 0) return {};

  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_submissions')
    .select('session_id')
    .in('session_id', sessionIds)
    .neq('status', 'declined');

  if (error) {
    console.error('[recruitmentSessions] comptage impossible:', error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { session_id: string | null }[]) {
    if (row.session_id) counts[row.session_id] = (counts[row.session_id] ?? 0) + 1;
  }
  return counts;
}

/** Candidature du compte, s'il en a une. Un compte n'en a jamais plus d'une :
 *  l'index unique `uniq_recruitment_submission_per_user` le garantit. */
export interface OwnSubmission {
  id: string;
  first_name: string;
  last_name: string;
  session_id: string | null;
}

/**
 * Lit la candidature du compte — donc sa reservation de session, portee par
 * `session_id`.
 *
 * Client admin ici aussi : la policy `recruitment_own_select` autoriserait bien
 * cette lecture avec la cle visiteur, mais seulement si l'appelant porte le JWT
 * du membre. Les appels viennent du rendu serveur et d'une route API, ou l'on
 * dispose de l'`userId` verifie sans forcement d'un client authentifie sous son
 * identite. On passe donc par le client admin en filtrant explicitement sur
 * `user_id` : une seule ligne sort, celle du compte demande.
 */
export async function getOwnSubmission(userId: string): Promise<OwnSubmission | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_submissions')
    .select('id, first_name, last_name, session_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[recruitmentSessions] lecture candidature impossible:', error.message);
    return null;
  }
  return (data as OwnSubmission | null) ?? null;
}
