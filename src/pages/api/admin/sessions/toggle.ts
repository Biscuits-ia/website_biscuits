// src/pages/api/admin/sessions/toggle.ts
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
  const newValue  = getFormString(form, 'is_published') === 'true';

  if (!isValidUUID(sessionId)) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('ID session invalide.'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('workshop_sessions')
    .update({ is_published: newValue })
    .eq('id', sessionId);

  if (error) {
    console.error('[admin/sessions/toggle]', error.message);
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Erreur lors du changement de statut.'));
  }

  return redirect('/dashboard/admin/ateliers?saved=1');
};
