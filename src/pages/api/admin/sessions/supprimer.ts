// src/pages/api/admin/sessions/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

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
