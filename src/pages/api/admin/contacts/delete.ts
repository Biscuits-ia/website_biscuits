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
