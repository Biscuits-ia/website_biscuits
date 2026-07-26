import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { PUBLIC_SESSION_COLUMNS, countActiveCandidatesBySession } from '@/lib/recruitmentSessions';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** GET /api/recruitment/sessions — sessions ouvertes à venir + places restantes. */
export const GET: APIRoute = async () => {
  const { data: sessions, error } = await createSupabaseAdminClient()
    .from('recruitment_sessions')
    .select(PUBLIC_SESSION_COLUMNS)
    .eq('status', 'open')
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[api/recruitment/sessions] erreur:', error.message, error.details);
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions.' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const rows = (sessions ?? []) as unknown as Array<{ id: string; max_candidates: number }>;
  const counts = await countActiveCandidatesBySession(rows.map((s) => s.id));

  const sessionsWithStats = rows.map((s) => ({
    ...s,
    candidate_count: counts[s.id] ?? 0,
    places_remaining: Math.max(0, s.max_candidates - (counts[s.id] ?? 0)),
  }));

  return new Response(JSON.stringify(sessionsWithStats), { status: 200, headers: JSON_HEADERS });
};
