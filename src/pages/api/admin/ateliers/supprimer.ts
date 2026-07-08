// src/pages/api/admin/ateliers/supprimer.ts
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

  const form       = await request.formData();
  const workshopId = getFormString(form, 'workshop_id');

  if (!isValidUUID(workshopId)) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('ID atelier invalide.'));
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('workshops')
    .delete()
    .eq('id', workshopId);

  if (error) {
    console.error('[admin/ateliers/supprimer]', error.message);
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }

  return redirect('/dashboard/admin/ateliers?saved=1');
};
