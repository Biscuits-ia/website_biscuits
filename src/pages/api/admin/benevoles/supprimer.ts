// src/pages/api/admin/benevoles/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const adminDb = createSupabaseAdminClient();
  const { data: profile } = await adminDb.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return new Response('Accès interdit', { status: 403 });

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
