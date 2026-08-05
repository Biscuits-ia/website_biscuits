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
  const requestId = form.get('request_id') as string | null;
  const status = form.get('status') as string | null;
  const adminReply = (form.get('admin_reply') as string | null)?.slice(0, 5000) ?? null;

  if (!isValidUUID(requestId))
    return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('ID invalide'));

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
    return redirect(
      '/dashboard/admin/demandes?error=' + encodeURIComponent('Erreur lors de la mise à jour')
    );
  }

  return redirect('/dashboard/admin/demandes?saved=1');
};
