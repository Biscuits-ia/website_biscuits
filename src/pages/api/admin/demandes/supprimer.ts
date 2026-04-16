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
  const requestId = form.get('request_id') as string | null;

  if (!isValidUUID(requestId)) return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('ID invalide'));

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('requests')
    .delete()
    .eq('id', requestId);

  if (error) {
    return redirect('/dashboard/admin/demandes?error=' + encodeURIComponent('Erreur lors de la suppression'));
  }

  return redirect('/dashboard/admin/demandes?saved=1');
};
