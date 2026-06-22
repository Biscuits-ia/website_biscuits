import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
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

    // Validation cohérence temporelle
    const startMs = Date.parse(start_time);
    const endMs = Date.parse(end_time);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
      return new Response(
        JSON.stringify({ error: 'Plage horaire invalide (start_time < end_time requis)' }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const adminDb = createSupabaseAdminClient();

    // Anti-overlap serveur : aucun slot existant ne doit chevaucher la plage.
    // Logique : overlap ssi existing.start < new.end  ET  existing.end > new.start.
    // On bypass RLS via adminDb pour voir tous les slots, y compris ceux marqués indisponibles.
    const { data: overlap, error: overlapErr } = await adminDb
      .from('appointment_slots')
      .select('id, start_time, end_time')
      .lt('start_time', end_time)
      .gt('end_time', start_time)
      .limit(1)
      .maybeSingle();

    if (overlapErr) {
      console.error('[appointment-slots POST] overlap check error:', overlapErr);
      return new Response(JSON.stringify({ error: 'Erreur lors de la vérification des chevauchements' }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    if (overlap) {
      return new Response(
        JSON.stringify({ error: 'Ce créneau chevauche un créneau existant.' }),
        { status: 409, headers: JSON_HEADERS },
      );
    }

    const { data, error } = await adminDb
      .from('appointment_slots')
      .insert({ start_time, end_time, is_available: true })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[appointment-slots] POST error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
