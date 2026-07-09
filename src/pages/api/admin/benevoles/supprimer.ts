// src/pages/api/admin/benevoles/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const adminDb = createSupabaseAdminClient();

  const form = await request.formData();
  const id   = (form.get('id') as string | null)?.trim() ?? '';

  if (!isValidUUID(id)) return new Response('id invalide', { status: 400 });

  // Supprimer la photo dans le bucket
  const { data: files } = await adminDb.storage.from('benevoles').list(id);
  if (files && files.length > 0) {
    const paths = files.map((f: { name: string }) => `${id}/${f.name}`);
    await adminDb.storage.from('benevoles').remove(paths);
  }

  // Supprimer l'enregistrement
  const { error } = await adminDb.from('benevoles').delete().eq('id', id);

  if (error) {
    console.error('[benevoles/supprimer]', error.message);
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Erreur lors de la suppression.'));
  }

  return redirect('/dashboard/admin/trombinoscope?saved=1');
};
