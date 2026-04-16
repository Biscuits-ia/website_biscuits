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
  const contactId = form.get('contact_id') as string | null;

  if (!isValidUUID(contactId)) return redirect('/dashboard/admin/contacts?error=' + encodeURIComponent('ID invalide'));

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('contact_submissions')
    .delete()
    .eq('id', contactId);

  if (error) {
    return redirect('/dashboard/admin/contacts?error=' + encodeURIComponent('Erreur lors de la suppression'));
  }

  return redirect('/dashboard/admin/contacts?saved=1');
};
