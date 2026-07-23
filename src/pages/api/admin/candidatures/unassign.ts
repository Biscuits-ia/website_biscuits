import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { notifySessionUnassigned } from '@/lib/recruitmentMail';
import type { RecruitmentSubmission } from '@/types/recruitment';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

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
    .select()
    .single();

  if (error || !updated) {
    return new Response(JSON.stringify({ error: 'Erreur lors de la désaffectation.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await notifySessionUnassigned(updated as unknown as RecruitmentSubmission);
  } catch (err) {
    console.error('[candidatures unassign] email error:', err);
  }

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
