import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { notifySessionAssigned, notifySessionUnassigned } from '@/lib/recruitmentMail';
import type { RecruitmentSession, RecruitmentSubmission } from '@/types/recruitment';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'ID de session invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const submissionId = body.submission_id;
  if (!isValidUUID(submissionId)) {
    return new Response(JSON.stringify({ error: 'ID de candidature invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createSupabaseAdminClient();

  // Vérifier que la session existe et est ouverte
  const { data: session, error: sessionError } = await admin
    .from('recruitment_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: 'Session introuvable.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (session.status !== 'open') {
    return new Response(JSON.stringify({ error: 'La session n\'est pas ouverte aux inscriptions.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Vérifier la candidature
  const { data: submission, error: submissionError } = await admin
    .from('recruitment_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (submissionError || !submission) {
    return new Response(JSON.stringify({ error: 'Candidature introuvable.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mise à jour atomique protégée par le trigger de capacité
  const { data: updated, error: updateError } = await admin
    .from('recruitment_submissions')
    .update({ session_id: id })
    .eq('id', submissionId)
    .select()
    .single();

  if (updateError) {
    const msg = updateError.message.includes('capacité')
      ? 'Cette session est pleine.'
      : 'Erreur lors de l\'affectation.';
    return new Response(JSON.stringify({ error: msg }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Notification best-effort (ne bloque pas la réponse)
  try {
    await notifySessionAssigned(
      updated as unknown as RecruitmentSubmission,
      session as unknown as RecruitmentSession,
    );
  } catch (err) {
    console.error('[recruitment assign] email error:', err);
  }

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'ID de session invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const submissionId = body.submission_id;
  if (!isValidUUID(submissionId)) {
    return new Response(JSON.stringify({ error: 'ID de candidature invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createSupabaseAdminClient();

  const { data: updated, error } = await admin
    .from('recruitment_submissions')
    .update({ session_id: null })
    .eq('id', submissionId)
    .eq('session_id', id)
    .select()
    .single();

  if (error || !updated) {
    return new Response(JSON.stringify({ error: 'Erreur lors du retrait de la session.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await notifySessionUnassigned(updated as unknown as RecruitmentSubmission);
  } catch (err) {
    console.error('[recruitment unassign] email error:', err);
  }

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
