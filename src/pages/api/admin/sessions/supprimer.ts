// src/pages/api/admin/sessions/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form      = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!isValidUUID(sessionId)) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('ID session invalide.'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('workshop_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('[admin/sessions/supprimer]', error.message);
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Erreur lors de la suppression de la session.'));
  }

  return redirect('/dashboard/admin/ateliers?saved=1');
};
