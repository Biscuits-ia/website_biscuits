import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
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

    if (!isValidUUID(params.id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400, headers: JSON_HEADERS });
    }

    const body = await request.json() as { status?: unknown };
    if (!body.status || !['confirmed', 'cancelled'].includes(body.status as string)) {
      return new Response(JSON.stringify({ error: 'Statut invalide' }), { status: 400, headers: JSON_HEADERS });
    }

    const { data, error } = await createSupabaseAdminClient()
      .from('volunteer_appointments')
      .update({ status: body.status })
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[admin/appointments/[id]] PATCH error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
