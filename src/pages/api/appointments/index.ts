import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { randomBytes } from 'crypto';

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
 * Body: { candidate_email?: string, admin_notes?: string }
 */
export const POST: APIRoute = async ({ request, cookies }) => {
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

    const body = await request.json() as { candidate_email?: string; admin_notes?: string };

    // Générer un token sécurisé
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48h

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .insert([
        {
          token,
          candidate_email: body.candidate_email || null,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
          admin_notes: body.admin_notes || null,
        },
      ])
      .select();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Retourner le token et l'URL d'accès
    const appointmentUrl = `${new URL(request.url).origin}/rdv/${token}`;

    return new Response(
      JSON.stringify({
        ...data[0],
        appointment_url: appointmentUrl,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error creating appointment:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
