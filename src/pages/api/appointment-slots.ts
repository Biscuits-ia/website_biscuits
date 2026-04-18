import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** GET /api/appointment-slots — admin voit tout, user voit uniquement les créneaux disponibles */
export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: JSON_HEADERS });
    }

    const role = await fetchRoleSecure(user.id);

    let query = supabase.from('appointment_slots').select('*');
    if (role !== 'admin') {
      query = query.eq('is_available', true);
    }

    const { data, error } = await query.order('start_time', { ascending: true });
    if (error) throw error;

    return new Response(JSON.stringify(data ?? []), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[appointment-slots] GET error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};

/** POST /api/appointment-slots — création d'un créneau (admin seulement) */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: JSON_HEADERS });
    }

    const role = await fetchRoleSecure(user.id);
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: JSON_HEADERS });
    }

    const body = await request.json() as Record<string, unknown>;
    const { start_time, end_time } = body;

    if (typeof start_time !== 'string' || !start_time || typeof end_time !== 'string' || !end_time) {
      return new Response(
        JSON.stringify({ error: 'start_time et end_time sont requis (chaînes ISO)' }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const { data, error } = await supabase
      .from('appointment_slots')
      .insert([{ start_time, end_time, is_available: true }])
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[appointment-slots] POST error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
