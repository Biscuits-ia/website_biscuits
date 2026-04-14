// src/pages/api/admin/resources/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/ateliers';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const adminDb = createSupabaseAdminClient();
  const { data: profile } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return new Response('Accès interdit', { status: 403 });
  }

  const form       = await request.formData();
  const resourceId = getFormString(form, 'resource_id');
  if (!resourceId) return new Response('resource_id requis', { status: 400 });

  // Récupère le file_path avant suppression pour nettoyer le Storage
  const { data: resource, error: fetchError } = await adminDb
    .from('resources')
    .select('file_path')
    .eq('id', resourceId)
    .single();

  if (fetchError || !resource) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Ressource introuvable.'));
  }

  // Supprime l'enregistrement BDD
  const { error: deleteError } = await adminDb
    .from('resources')
    .delete()
    .eq('id', resourceId);

  if (deleteError) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent(deleteError.message));
  }

  // Supprime le fichier du Storage (best-effort — ne bloque pas si échoue)
  await adminDb.storage.from('resources').remove([resource.file_path]);

  return redirect('/dashboard/admin/resources?saved=1');
};