import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

/**
 * PUT /api/appointments/{id}
 * Met à jour un rendez-vous (confirmation du créneau)
 */
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json() as {
      selected_date?: string;
      selected_timezone?: string;
      status?: string;
    };

    // Vérifier que le rendez-vous existe et est encore valide
    const { data: existingAppt } = await supabase
      .from('volunteer_appointments')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingAppt) {
      return new Response(
        JSON.stringify({ error: 'Rendez-vous non trouvé' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier si expiré
    const now = new Date();
    const expiresAt = new Date(existingAppt.expires_at);

    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ error: 'Ce lien a expiré' }),
        { status: 410, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier si déjà utilisé
    if (existingAppt.status === 'booked') {
      return new Response(
        JSON.stringify({ error: 'Ce rendez-vous a déjà été confirmé' }),
        { status: 410, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mettre à jour
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.selected_date) {
      updateData.selected_date = body.selected_date;
      updateData.status = 'booked';
    }

    if (body.selected_timezone) {
      updateData.selected_timezone = body.selected_timezone;
    }

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data[0]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error updating appointment:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

/**
 * DELETE /api/appointments/{id}
 * Supprime un rendez-vous (admin only)
 */
export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    const { error } = await supabase
      .from('volunteer_appointments')
      .delete()
      .eq('id', id);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error deleting appointment:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
