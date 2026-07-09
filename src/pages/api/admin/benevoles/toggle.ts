// src/pages/api/admin/benevoles/toggle.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const adminDb = createSupabaseAdminClient();

  const form  = await request.formData();
  const id    = (form.get('id') as string | null)?.trim() ?? '';
  const actif = form.get('actif') === 'true';

  if (!isValidUUID(id)) return new Response('id invalide', { status: 400 });

  const { error } = await adminDb.from('benevoles').update({ actif }).eq('id', id);

  if (error) {
    console.error('[benevoles/toggle]', error.message);
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Erreur lors de la mise à jour.'));
  }

  return redirect('/dashboard/admin/trombinoscope?saved=1');
};
