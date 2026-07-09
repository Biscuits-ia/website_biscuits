// src/pages/api/resources/telecharger.ts
// ----------------------------------------------------------------------------
// Génère une signed URL valable 60s et redirige vers elle.
// Logue le téléchargement dans `resource_downloads` (table de log, append-only).
// Accessible à tous (connectés + anonymes).
//
// ── Architecture (audit P4 #35) ──────────────────────────────────────────────
// Auparavant, chaque GET déclenchait 2 écritures synchrones cote user :
//   1. rpc('increment_downloads') → UPDATE resources SET downloads = downloads + 1
//   2. INSERT dans resource_downloads
// Une seule requête amplifiait donc 2 écritures DB avec la cle service_role,
// sans rate-limit. Un attaquant pouvait saturer la DB à faible cout.
//
// Nouvelle architecture (CQRS-lite) :
//   * Cote user : 1 INSERT dans resource_downloads (log, append-only).
//   * Cote user : rate-limit distribué Upstash (20/h par IP) avant tout I/O.
//   * Cote cron : un worker `aggregate-downloads` agrege periodiquement
//     le log → resources.downloads via pg_cron (toutes les 5 minutes).
// Le compteur affiché est eventuellement consistant (lag max = 1 cycle cron),
// ce qui est acceptable pour un compteur de telechargements.
//
// Le RPC `increment_downloads` reste dans la base (utilisé par les imports /
// scripts), mais n'est plus appelé depuis cette route.
// ────────────────────────────────────────────────────────────────────────────

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';
import { rateLimitRoute } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';

// Limite : 20 telechargements par heure par IP. Largement au-dessus d'un
// usage normal (un user qui telecharge 5 PDFs en 10 min), coupe les scripts
// de scraping sans bloquer les humains.
const DOWNLOAD_LIMIT = 20;
const DOWNLOAD_WINDOW_MS = 60 * 60_000; // 1h

export const GET: APIRoute = async ({ url, request, cookies, clientAddress }) => {
  // 1. Rate-limit distribué (Upstash) AVANT tout I/O Supabase. Si l'IP est
  //    au plafond, on renvoie 429 sans toucher la DB.
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = await rateLimitRoute(
    ip,
    '/api/resources/telecharger',
    DOWNLOAD_LIMIT,
    DOWNLOAD_WINDOW_MS,
  );
  if (blocked) return blocked;

  // 2. Validation de l'ID.
  const resourceId = url.searchParams.get('id');
  if (!isValidUUID(resourceId)) {
    return new Response('id invalide', { status: 400 });
  }

  const adminDb = createSupabaseAdminClient();

  // 3. Vérifie que la ressource existe et est publiée.
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

  // 4. Génère une signed URL valable 60 secondes.
  const { data: signedData, error: signError } = await adminDb.storage
    .from('resources')
    .createSignedUrl(resource.file_path, 60, {
      download: resource.file_name,
    });

  if (signError || !signedData?.signedUrl) {
    return new Response('Impossible de générer le lien de téléchargement.', { status: 500 });
  }

  // 5. Logue le téléchargement (1 INSERT, append-only). Le compteur denormalise
  //    `resources.downloads` est mis a jour de maniere asynchrone par le
  //    worker cron `aggregate-downloads` (voir src/pages/api/cron/aggregate-downloads.ts).
  let userId: string | null = null;
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Anonyme — pas de problème
  }

  const { error: insertError } = await adminDb
    .from('resource_downloads')
    .insert({ resource_id: resourceId, user_id: userId });

  if (insertError) {
    // Log mais ne bloque pas le telechargement : la signed URL est deja
    // generee, l'utilisateur a paye le cout Storage. Perdre 1 increment
    // de log est preferable a un 500.
    console.error('[telecharger] log insert failed:', insertError.message);
  }

  // 6. Redirige vers la signed URL.
  return Response.redirect(signedData.signedUrl, 302);
};
