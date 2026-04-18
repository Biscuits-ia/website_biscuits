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
    const { data: appointments, error } = await adminDb
      .from('volunteer_appointments')
      .select('*, appointment_slots(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Récupérer les profils pour les user_id présents
    // (pas de FK directe vers profiles dans le schéma, donc requête séparée)
    const userIds = [...new Set((appointments ?? []).map((a) => a.user_id).filter(Boolean))];
    let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await adminDb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      for (const p of profiles ?? []) {
        profilesMap[p.id] = { full_name: p.full_name, email: p.email };
      }
    }

    const enriched = (appointments ?? []).map((a) => ({
      ...a,
      user_profile: a.user_id ? (profilesMap[a.user_id] ?? null) : null,
    }));

    return new Response(JSON.stringify(enriched), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[admin/appointments] GET error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
