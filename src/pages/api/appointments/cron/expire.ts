import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/appointments/cron/expire
 * Marque les rendez-vous expirants comme 'expired'
 * Doit être appelé via un cron job (Vercel Cron, Supabase Cron, ou scheduling externe)
 *
 * Authentification: Bearer token dans l'env variable CRON_SECRET
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Vérifier le secret du cron (pour éviter les appels non autorisés)
    const authHeader = request.headers.get('authorization');
    const expectedSecret = import.meta.env.CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Récupérer tous les rendez-vous pendants qui ont expiré
    const now = new Date().toISOString();

    const { data: expiredAppointments, error: selectError } = await supabase
      .from('volunteer_appointments')
      .select('id')
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows (normal)
      throw selectError;
    }

    const expiredCount = expiredAppointments?.length || 0;

    if (expiredCount === 0) {
      return new Response(
        JSON.stringify({ success: true, expired_count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mettre à jour tous les rendez-vous expirés
    const { error: updateError } = await supabase
      .from('volunteer_appointments')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (updateError) {
      throw updateError;
    }

    console.log(`[Cron] Marked ${expiredCount} appointments as expired`);

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: expiredCount,
        timestamp: now,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in expiration cron:', err);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
