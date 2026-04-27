// src/pages/api/admin/benevoles/toggle.ts
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
