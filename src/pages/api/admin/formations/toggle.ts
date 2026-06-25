// ============================================================================
// src/pages/api/admin/formations/toggle.ts
// ----------------------------------------------------------------------------
// Toggle l''etat publie / brouillon d''une formation (admin).
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { uuidSchema } from '@/lib/formations';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const idRaw      = getFormString(form, 'training_id') ?? '';
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
    .from('trainings')
    .update({ is_published: target })
    .eq('id', idParsed.data);

  if (error) {
    console.error('[admin/formations/toggle] update error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors du changement de statut.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};