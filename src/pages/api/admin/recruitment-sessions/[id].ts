import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import type { RecruitmentSession, RecruitmentSessionStatus, RecruitmentSubmission } from '@/types/recruitment';

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

function badRequest(error: string) {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) return badRequest('ID invalide');

  const admin = createSupabaseAdminClient();

  const [{ data: session, error: sessionError }, { data: candidates, error: candidatesError }] = await Promise.all([
    admin.from('recruitment_sessions').select('*').eq('id', id).single(),
    admin
      .from('recruitment_submissions')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: 'Session introuvable.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (candidatesError) {
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des candidats.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activeCount = (candidates ?? []).filter((c: RecruitmentSubmission) => c.status !== 'declined').length;

  return new Response(
    JSON.stringify({
      session: session as RecruitmentSession,
      candidates: candidates ?? [],
      candidate_count: activeCount,
      places_remaining: Math.max(0, session.max_candidates - activeCount),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) return badRequest('ID invalide');

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return badRequest('Corps de requête invalide.');
  }

  const update: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return badRequest('Le titre est obligatoire.');
    if (title.length > MAX_TITLE) return badRequest(`Le titre ne doit pas dépasser ${MAX_TITLE} caractères.`);
    update.title = title;
  }

  if (typeof body.description === 'string') {
    const description = body.description.trim() || null;
    if (description && description.length > MAX_DESCRIPTION) {
      return badRequest(`La description ne doit pas dépasser ${MAX_DESCRIPTION} caractères.`);
    }
    update.description = description;
  }

  if (typeof body.location === 'string') {
    const location = body.location.trim() || null;
    if (location && location.length > MAX_LOCATION) {
      return badRequest(`Le lieu/lien ne doit pas dépasser ${MAX_LOCATION} caractères.`);
    }
    update.location = location;
  }

  if (body.scheduled_at !== undefined) {
    const scheduledAt = parseIsoDate(body.scheduled_at);
    if (!scheduledAt) return badRequest('La date et heure sont invalides.');
    update.scheduled_at = scheduledAt;
  }

  if (body.duration_minutes !== undefined) {
    const duration = typeof body.duration_minutes === 'number' ? body.duration_minutes : NaN;
    if (Number.isNaN(duration) || duration < 1 || duration > 480) {
      return badRequest('La durée doit être comprise entre 1 et 480 minutes.');
    }
    update.duration_minutes = duration;
  }

  if (body.max_candidates !== undefined) {
    const maxCandidates = typeof body.max_candidates === 'number' ? body.max_candidates : NaN;
    if (Number.isNaN(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) {
      return badRequest('Le nombre de places doit être compris entre 1 et 100.');
    }
    update.max_candidates = maxCandidates;
  }

  if (body.status !== undefined) {
    if (!isValidSessionStatus(body.status)) return badRequest('Statut invalide.');
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return badRequest('Aucun champ à mettre à jour.');
  }

  const admin = createSupabaseAdminClient();

  // Si on réduit max_candidates en dessous du nombre déjà inscrit, on refuse.
  if (typeof update.max_candidates === 'number') {
    const { count, error: countError } = await admin
      .from('recruitment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', id)
      .neq('status', 'declined');

    if (!countError && count != null && count > update.max_candidates) {
      return badRequest(`Il y a déjà ${count} candidat(s) actif(s) dans cette session. Supprimez-les ou augmentez la capacité.`);
    }
  }

  const { data, error } = await admin
    .from('recruitment_sessions')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la mise à jour.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) return badRequest('ID invalide');

  const admin = createSupabaseAdminClient();

  const { count, error: countError } = await admin
    .from('recruitment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id);

  if (!countError && count != null && count > 0) {
    return new Response(
      JSON.stringify({ error: `Impossible de supprimer : ${count} candidature(s) liée(s). Retirez-les d'abord.` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { error } = await admin.from('recruitment_sessions').delete().eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la suppression.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
