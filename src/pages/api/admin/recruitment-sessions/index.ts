import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import type { RecruitmentSession, RecruitmentSessionStatus } from '@/types/recruitment';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_LOCATION = 300;

function isValidSessionStatus(value: unknown): value is RecruitmentSessionStatus {
  return value === 'open' || value === 'closed' || value === 'cancelled' || value === 'done';
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const admin = createSupabaseAdminClient();

  const { data: sessions, error } = await admin
    .from('recruitment_sessions')
    .select('*')
    .order('scheduled_at', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Comptage des candidatures actives par session (hors refusés)
  const sessionIds = (sessions ?? []).map((s: RecruitmentSession) => s.id);
  let counts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: rows, error: countError } = await admin
      .from('recruitment_submissions')
      .select('session_id, id')
      .in('session_id', sessionIds)
      .neq('status', 'declined');

    if (!countError && rows) {
      counts = rows.reduce((acc: Record<string, number>, row: { session_id: string | null }) => {
        if (row.session_id) {
          acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
        }
        return acc;
      }, {});
    }
  }

  const sessionsWithStats = (sessions ?? []).map((s: RecruitmentSession) => ({
    ...s,
    candidate_count: counts[s.id] ?? 0,
    places_remaining: Math.max(0, s.max_candidates - (counts[s.id] ?? 0)),
  }));

  return new Response(JSON.stringify(sessionsWithStats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const location = typeof body.location === 'string' ? body.location.trim() || null : null;
  const scheduledAt = parseIsoDate(body.scheduled_at);
  const durationMinutes = typeof body.duration_minutes === 'number' ? body.duration_minutes : NaN;
  const maxCandidates = typeof body.max_candidates === 'number' ? body.max_candidates : NaN;
  const status = isValidSessionStatus(body.status) ? body.status : 'open';

  const errors: string[] = [];
  if (!title) errors.push('Le titre est obligatoire.');
  else if (title.length > MAX_TITLE) errors.push(`Le titre ne doit pas dépasser ${MAX_TITLE} caractères.`);
  if (!scheduledAt) errors.push('La date et heure sont invalides.');
  if (Number.isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    errors.push('La durée doit être comprise entre 1 et 480 minutes.');
  }
  if (Number.isNaN(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) {
    errors.push('Le nombre de places doit être compris entre 1 et 100.');
  }
  if (description && description.length > MAX_DESCRIPTION) {
    errors.push(`La description ne doit pas dépasser ${MAX_DESCRIPTION} caractères.`);
  }
  if (location && location.length > MAX_LOCATION) {
    errors.push(`Le lieu/lien ne doit pas dépasser ${MAX_LOCATION} caractères.`);
  }

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(' ') }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('recruitment_sessions')
    .insert({
      title,
      description,
      scheduled_at: scheduledAt!,
      duration_minutes: durationMinutes,
      location,
      max_candidates: maxCandidates,
      status,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
