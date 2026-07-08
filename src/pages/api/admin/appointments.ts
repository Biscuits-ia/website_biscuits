import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdminJson } from '@/lib/auth';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const GET: APIRoute = async (ctx) => {
  try {
    const auth = await requireAdminJson(ctx);
    if (auth instanceof Response) return auth;
    const { user: _user } = auth;

    // Utiliser le client admin (service_role) pour bypasser les RLS
    // et voir TOUTES les réservations, pas seulement celles de l'admin connecté
    const adminDb = createSupabaseAdminClient();

    // FIX P1 2.4 : pagination (page/limit) + filtres status/slot_id/from/to.
    // Limite par defaut 50, max 200. Retourne { data, total, page, limit }.
    const url = new URL(ctx.request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
    const statusFilter = url.searchParams.get('status') ?? '';
    const slotFilter  = url.searchParams.get('slot_id') ?? '';
    const fromParam   = url.searchParams.get('from') ?? '';
    const toParam     = url.searchParams.get('to') ?? '';
    const offset = (page - 1) * limit;

    let query = adminDb
      .from('volunteer_appointments')
      .select('*, appointment_slots(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (slotFilter)  query = query.eq('slot_id', slotFilter);
    if (fromParam)   query = query.gte('created_at', fromParam);
    if (toParam) {
      const toDate = new Date(toParam);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt('created_at', toDate.toISOString());
    }
    const { data: appointments, error, count } = await query;

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

    return new Response(
      JSON.stringify({ data: enriched, total: count ?? 0, page, limit }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error('[admin/appointments] GET error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
