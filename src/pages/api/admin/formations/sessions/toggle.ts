// ============================================================================
// src/pages/api/admin/formations/sessions/toggle.ts
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
  const idRaw      = getFormString(form, 'session_id') ?? '';
  const targetRaw  = getFormString(form, 'is_published') ?? 'true';
  const target     = targetRaw === 'true' || targetRaw === '1';

  const idParsed = uuidSchema.safeParse(idRaw);
  if (!idParsed.success) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Identifiant invalide.')}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('training_sessions')
    .update({ is_published: target })
    .eq('id', idParsed.data);

  if (error) {
    console.error('[admin/formations/sessions/toggle] update error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors du changement de statut.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};