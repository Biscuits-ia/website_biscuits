import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';
import { requireAppointmentOwner } from '@/lib/auth';

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    // Un user ne peut supprimer que SES RDV. Les admin/moderator ne sont pas
    // autorisés à DELETE ici — ils utilisent PATCH /api/admin/appointments/[id]
    // pour changer le statut (cancelled). Cela évite de bypasser les hooks de
    // notif prévus en couche 3.
    const guard = await requireAppointmentOwner(supabase, id, user.id, /* isAdminOrModerator */ false);
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.status === 404 ? 'Réservation non trouvée' : 'Non autorisé' }), {
        status: guard.status,
      });
    }

    // Soft-cancel plutôt que hard-delete : on conserve l'historique.
    // Le partial unique index autorise plusieurs RDV annulés sur le même slot.
    const { error: updateError } = await supabase
      .from('volunteer_appointments')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[user-appointments DELETE] error:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};
