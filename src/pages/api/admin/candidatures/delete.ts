import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form = await request.formData();
  const submissionId = form.get('submission_id') as string | null;

  if (!isValidUUID(submissionId)) return redirect('/dashboard/admin/candidatures?error=' + encodeURIComponent('ID invalide'));

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('recruitment_submissions')
    .delete()
    .eq('id', submissionId);

  if (error) {
    return redirect('/dashboard/admin/candidatures?error=' + encodeURIComponent('Erreur lors de la suppression'));
  }

  return redirect('/dashboard/admin/candidatures?saved=1');
};
