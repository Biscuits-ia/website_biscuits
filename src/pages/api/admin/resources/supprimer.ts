// src/pages/api/admin/resources/supprimer.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const adminDb = createSupabaseAdminClient();

  const form       = await request.formData();
  const resourceId = getFormString(form, 'resource_id');
  if (!isValidUUID(resourceId)) return new Response('resource_id invalide', { status: 400 });

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
    console.error('[supprimer] Supabase error:', deleteError.message);
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Erreur lors de la suppression de la ressource.'));
  }

  // Supprime le fichier du Storage (best-effort — ne bloque pas si échoue)
  await adminDb.storage.from('resources').remove([resource.file_path]);

  return redirect('/dashboard/admin/resources?saved=1');
};