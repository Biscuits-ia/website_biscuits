import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabase';
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
