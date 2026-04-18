import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: JSON_HEADERS });
    }

    const role = await fetchRoleSecure(user.id);
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403, headers: JSON_HEADERS });
    }

    // Utiliser le client admin (service_role) pour bypasser les RLS
    // et voir TOUTES les réservations, pas seulement celles de l'admin connecté
    const adminDb = createSupabaseAdminClient();
    const { data, error } = await adminDb
      .from('volunteer_appointments')
      .select(`
        *,
        appointment_slots(*),
        user_profile:profiles(full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(JSON.stringify(data ?? []), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[admin/appointments] GET error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
