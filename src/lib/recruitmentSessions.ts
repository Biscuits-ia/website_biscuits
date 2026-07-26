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
