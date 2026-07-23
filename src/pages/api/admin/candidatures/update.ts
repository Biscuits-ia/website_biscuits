import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { notifyStatusDecision } from '@/lib/recruitmentMail';
import type { RecruitmentSubmission } from '@/types/recruitment';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form = await request.formData();
  const submissionId = form.get('submission_id') as string | null;
  const status       = form.get('status')        as string | null;
  const adminNotes   = (form.get('admin_notes') as string | null)?.slice(0, 2000) ?? null;

  if (!isValidUUID(submissionId)) return redirect('/dashboard/admin/candidatures?error=' + encodeURIComponent('ID invalide'));

  const validStatuses = ['new', 'reviewing', 'accepted', 'declined'];
  if (status && !validStatuses.includes(status)) {
    return redirect('/dashboard/admin/candidatures?error=' + encodeURIComponent('Statut invalide'));
  }

  const admin = createSupabaseAdminClient();

  // Récupérer la candidature actuelle pour connaître l'ancien statut
  const { data: current } = await admin
    .from('recruitment_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  const { error } = await admin
    .from('recruitment_submissions')
    .update({
      ...(status ? { status } : {}),
      admin_notes: adminNotes ?? null,
    })
    .eq('id', submissionId);

  if (error) {
    return redirect('/dashboard/admin/candidatures?error=' + encodeURIComponent('Erreur lors de la mise à jour'));
  }

  // Envoyer un email si le statut passe à accepted ou declined
  const shouldNotify = status && current && status !== current.status && (status === 'accepted' || status === 'declined');
  if (shouldNotify) {
    try {
      await notifyStatusDecision({ ...current, status } as RecruitmentSubmission);
    } catch (err) {
      console.error('[candidatures update] email error:', err);
    }
  }

  return redirect('/dashboard/admin/candidatures?saved=1');
};
