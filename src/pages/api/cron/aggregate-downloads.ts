// ============================================================================
// src/pages/api/cron/aggregate-downloads.ts
// ----------------------------------------------------------------------------
// Worker declenche par Supabase pg_cron (toutes les 5 minutes) via
// net.http_post() sur l'URL publique ci-dessous. Voir migration
// 20260709_pg_cron_aggregate_downloads.sql pour la planification.
//
// Authentification : Header Authorization: Bearer <CRON_SECRET>.
// En local  : curl -H "Authorization: Bearer xxx" http://localhost:4321/api/cron/aggregate-downloads
// En prod   : pg_cron envoie la cle depuis public.app_runtime_config
//             (ou vault.secrets 'cron_secret').
//
// Le travail reelement utile est fait cote Postgres par la fonction SQL
// `public.aggregate_downloads()` (meme transaction, advisory lock, curseur
// dans app_runtime_config). Ce handler n'est qu'un proxy auth-check qui
// appelle la fonction via le client service_role.
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyBearer } from '@/lib/secrets';

export const POST: APIRoute = async ({ request }) => {
  return await runWorker(request);
};

export const GET: APIRoute = async ({ request }) => {
  return await runWorker(request);
};

async function runWorker(request: Request): Promise<Response> {
  const expectedSecret = import.meta.env.CRON_SECRET;

  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!verifyBearer(request.headers.get('authorization'), expectedSecret)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const source = request.headers.get('x-cron-source') ?? 'manual';
  const vercelId = request.headers.get('x-vercel-id') ?? null;
  const startTime = Date.now();

  let aggregated: number;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('aggregate_downloads');
    if (error) throw new Error(error.message);
    aggregated = typeof data === 'number' ? data : 0;
  } catch (err) {
    console.error('[cron/aggregate-downloads] error:', err, { source, vercelId });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const durationMs = Date.now() - startTime;
  console.log(
    JSON.stringify({
      msg:        'cron/aggregate-downloads',
      source,
      vercelId,
      durationMs,
      aggregated,
    }),
  );

  return new Response(
    JSON.stringify({ aggregated, durationMs, source }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
