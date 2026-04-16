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
  const requestId  = form.get('request_id')  as string | null;
  const status     = form.get('status')      as string | null;
  const adminReply = form.get('admin_reply') as string | null;

  if (!isValidUUID(requestId)) return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('ID invalide'));

  const validStatuses = ['pending', 'in_progress', 'resolved'];
  if (status && !validStatuses.includes(status)) {
    return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('Statut invalide'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('requests')
    .update({
      ...(status ? { status } : {}),
      admin_reply: adminReply ?? null,
    })
    .eq('id', requestId);

  if (error) {
    return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('Erreur lors de la mise à jour'));
  }

  return redirect('/dashboard/admin/demandes?saved=1');
};
