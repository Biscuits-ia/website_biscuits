import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

/**
 * GET /api/appointments/
 * Liste tous les rendez-vous (admin only)
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    // Vérifier que l'utilisateur est authentifié et admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error fetching appointments:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

/**
 * POST /api/appointments/
 * Crée un nouveau rendez-vous (admin only)
 * Body: { slot_id: string (UUID), candidate_email?: string, notes?: string }
 *
 * Validation runtime :
 * - slot_id doit etre un UUID (la FK l'attend).
 * - notes limite a 1000 chars (evite payload abusif).
 * - candidate_email limite a 255 chars et normalise en lowercase.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError('Unauthorized', 401);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return jsonError('Forbidden', 403);
    }

    const body = (await request.json()) as {
      slot_id?: string;
      candidate_email?: string;
      notes?: string;
    };

    if (!body.slot_id || !isValidUUID(body.slot_id)) {
      return jsonError('slot_id requis (UUID invalide)', 400);
    }

    // Sanitize: limite notes et candidate_email.
    const safeNotes = typeof body.notes === 'string'
      ? body.notes.slice(0, 1000)
      : null;
    const safeEmail = typeof body.candidate_email === 'string' && body.candidate_email
      ? body.candidate_email.slice(0, 255).trim().toLowerCase()
      : null;

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .insert({
        slot_id: body.slot_id,
        candidate_email: safeEmail,
        status: 'pending',
        notes: safeNotes,
      })
      .select()
      .single();

    if (error) {
      console.error('[appointments POST] error:', error);
      return jsonError(error.message, 500);
    }

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[appointments POST] unexpected error:', err);
    return jsonError('Erreur interne du serveur', 500);
  }
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
