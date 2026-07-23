import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const now = new Date().toISOString();

  const { data: sessions, error } = await supabase
    .from('recruitment_sessions')
    .select('*')
    .eq('status', 'open')
    .gt('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Compter les inscriptions actives par session pour afficher les places restantes
  const sessionIds = (sessions ?? []).map((s) => s.id);
  let counts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: rows, error: countError } = await supabase
      .from('recruitment_submissions')
      .select('session_id, id')
      .in('session_id', sessionIds)
      .neq('status', 'declined');

    if (!countError && rows) {
      counts = rows.reduce((acc: Record<string, number>, row: { session_id: string | null }) => {
        if (row.session_id) acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
        return acc;
      }, {});
    }
  }

  const sessionsWithStats = (sessions ?? []).map((s) => ({
    ...s,
    candidate_count: counts[s.id] ?? 0,
    places_remaining: Math.max(0, s.max_candidates - (counts[s.id] ?? 0)),
  }));

  return new Response(JSON.stringify(sessionsWithStats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
