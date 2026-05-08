import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

function getFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const formId = getFormString(form, 'form_id');
  const nextStatusRaw = getFormString(form, 'status').toLowerCase();
  const nextStatus = nextStatusRaw === 'published' ? 'published' : 'draft';

  if (!isValidUUID(formId)) {
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('ID de formulaire invalide.'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('study_forms')
    .update({ status: nextStatus })
    .eq('id', formId);

  if (error) {
    console.error('[admin/etudes/toggle] error:', error.message);
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Impossible de mettre à jour le statut.'));
  }

  return redirect('/dashboard/admin/etudes?saved=1');
};
