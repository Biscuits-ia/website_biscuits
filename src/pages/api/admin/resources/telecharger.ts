// src/pages/api/resources/telecharger.ts
// Génère une signed URL valable 60s et redirige vers elle.
// Logue le téléchargement dans resource_downloads.
// Accessible à tous (connectés + anonymes).
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

export const GET: APIRoute = async ({ url, request, cookies }) => {
  const resourceId = url.searchParams.get('id');
  if (!isValidUUID(resourceId)) {
    return new Response('id invalide', { status: 400 });
  }

  const adminDb = createSupabaseAdminClient();

  // Vérifie que la ressource est publiée
  const { data: resource, error: fetchError } = await adminDb
    .from('resources')
    .select('id, file_path, file_name, is_published')
    .eq('id', resourceId)
    .single();

  if (fetchError || !resource) {
    return new Response('Ressource introuvable.', { status: 404 });
  }

  if (!resource.is_published) {
    return new Response('Ressource non disponible.', { status: 403 });
  }

  // Génère une signed URL valable 60 secondes
  const { data: signedData, error: signError } = await adminDb.storage
    .from('resources')
    .createSignedUrl(resource.file_path, 60, {
      download: resource.file_name,
    });

  if (signError || !signedData?.signedUrl) {
    return new Response('Impossible de générer le lien de téléchargement.', { status: 500 });
  }

  // Incrémente le compteur de téléchargements
  await adminDb
    .from('resources')
    .update({ downloads: adminDb.rpc('increment_downloads', { row_id: resourceId }) })
    .eq('id', resourceId);

  // Récupère l'utilisateur connecté s'il y en a un (optionnel — anonyme autorisé)
  let userId: string | null = null;
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Anonyme — pas de problème
  }

  // Logue le téléchargement
  await adminDb
    .from('resource_downloads')
    .insert({ resource_id: resourceId, user_id: userId });

  // Redirige vers la signed URL
  return Response.redirect(signedData.signedUrl, 302);
};