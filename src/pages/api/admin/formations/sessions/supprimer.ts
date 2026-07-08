// ============================================================================
// src/pages/api/admin/formations/sessions/supprimer.ts
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { uuidSchema } from '@/lib/formations';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form = await request.formData();
  const idRaw = getFormString(form, 'session_id') ?? '';
  const idParsed = uuidSchema.safeParse(idRaw);
  if (!idParsed.success) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Identifiant invalide.')}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('training_sessions')
    .delete()
    .eq('id', idParsed.data);

  if (error) {
    console.error('[admin/formations/sessions/supprimer] delete error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors de la suppression.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};