import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

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

  return redirect('/dashboard/admin/candidatures?saved=1');
};
