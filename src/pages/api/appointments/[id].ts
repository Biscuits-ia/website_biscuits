import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

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
      token?: string;
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

    // Vérifier le token de sécurité (requis pour éviter l'IDOR)
    const bodyToken = typeof body.token === 'string' ? body.token.trim() : null;
    if (!bodyToken || bodyToken !== existingAppt.token) {
      return new Response(
        JSON.stringify({ error: 'Token de sécurité invalide ou manquant' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
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

    if (!isValidUUID(id)) {
      return new Response(
        JSON.stringify({ error: 'ID invalide' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Non authentifié' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const role = await fetchRoleSecure(user.id);
    if (role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
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
    console.error('[appointments/[id]] DELETE error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
