import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/appointments/cron/expire
 * Marque les rendez-vous pending expires comme 'expired'.
 *
 * Authentification: Bearer token dans l'env variable CRON_SECRET.
 * Pour etre planifie automatiquement, declare un cron Vercel dans vercel.json
 * (voir la section "crons" ajoutee dans cette migration).
 *
 * Implementation: une seule requete UPDATE atomique avec WHERE sur le statut
 * + expires_at. Plus de race condition entre le SELECT initial et l'UPDATE
 * (l'ancien code pouvait marquer 0 RDV si la fenetre glissait entre les deux
 * appels), et on recoit directement le nombre de lignes affectees.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedSecret = import.meta.env.CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // UPDATE atomique: une seule requete, le moteur DB garantit qu'aucune ligne
    // ne peut etre modifiee entre le check WHERE et l'ecriture.
    const { data, error } = await supabase
      .from('volunteer_appointments')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'pending')
      .lt('expires_at', now)
      .select('id');

    if (error) {
      throw error;
    }

    const expiredCount = data?.length ?? 0;
    console.log(`[Cron] Marked ${expiredCount} appointments as expired`);

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: expiredCount,
        timestamp: now,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Error in expiration cron:', err);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

// Vercel peut aussi declencher un cron via GET si on declare
// `{"path": "/api/appointments/cron/expire", "method": "GET"}` dans vercel.json.
// Ce handler est pratique pour les health-checks manuels.
// Il n'est PAS utilise en production (POST + Bearer uniquement).
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      endpoint: '/api/appointments/cron/expire',
      method: 'POST',
      auth: 'Bearer ${CRON_SECRET}',
      schedule_recommended: 'every 5 minutes',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};