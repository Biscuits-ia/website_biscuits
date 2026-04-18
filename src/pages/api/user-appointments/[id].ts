import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
    }

    // Récupérer l'utilisateur actuel
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    // Vérifier que l'utilisateur est propriétaire de cette réservation
    const { data: appointment, error: fetchError } = await supabase
      .from('volunteer_appointments')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !appointment) {
      return new Response(JSON.stringify({ error: 'Réservation non trouvée' }), { status: 404 });
    }

    if (appointment.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403 });
    }

    // Supprimer la réservation
    const { error: deleteError } = await supabase
      .from('volunteer_appointments')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Erreur:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};
