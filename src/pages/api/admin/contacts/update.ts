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
  const status = form.get('status') as string | null;
  const adminNotes = (form.get('admin_notes') as string | null)?.trim().slice(0, 2000) || null;

  if (!isValidUUID(contactId))
    return redirect('/dashboard/admin/contacts?error=' + encodeURIComponent('ID invalide'));

  const validStatuses = ['new', 'read', 'replied', 'archived'];
  if (status && !validStatuses.includes(status)) {
    return redirect('/dashboard/admin/contacts?error=' + encodeURIComponent('Statut invalide'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('contact_submissions')
    .update({
      ...(status ? { status } : {}),
      admin_notes: adminNotes ?? null,
    })
    .eq('id', contactId);

  if (error) {
    return redirect(
      '/dashboard/admin/contacts?error=' + encodeURIComponent('Erreur lors de la mise à jour')
    );
  }

  return redirect('/dashboard/admin/contacts?saved=1');
};
