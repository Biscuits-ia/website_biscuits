// ============================================================================
// src/pages/api/cron/email-outbox.ts
// ----------------------------------------------------------------------------
// Worker declenche par Supabase pg_cron (toutes les 2 minutes) via
// net.http_post() sur l'URL publique ci-dessous. Voir migration
// 20260624_pg_cron_email_outbox.sql pour la planification.
//
// Authentification : Header Authorization: Bearer .
// En local  : curl -H "Authorization: Bearer xxx" http://localhost:4321/api/cron/email-outbox
// En prod   : pg_cron envoie la cle depuis public.app_runtime_config
//             (ou vault.secrets 'cron_secret').
// ============================================================================

import type { APIRoute } from 'astro';
import { processEmailOutbox } from '@/lib/email-queue';
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

  // Tracabilite : on recupere la source declaree par l'appelant (header
  // X-Cron-Source) et le request id Vercel. C'est ce qui permet de
  // distinguer un appel pg_cron d'un appel manuel dans les logs.
  const source = request.headers.get('x-cron-source') ?? 'manual';
  const vercelId = request.headers.get('x-vercel-id') ?? null;
  const startTime = Date.now();

  let result;
  try {
    result = await processEmailOutbox();
  } catch (err) {
    console.error('[cron/email-outbox] error:', err, { source, vercelId });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const duration = Date.now() - startTime;
  // Log structure : une ligne par run, exploitable par Vercel log drains.
  console.log(
    JSON.stringify({
      msg:           'cron/email-outbox',
      source,         // 'pg_cron' | 'vercel' | 'manual'
      vercelId,
      durationMs:    duration,
      processed:     result.processed,
      succeeded:     result.succeeded,
      failed:        result.failed,
      retried:       result.retried,
      dead:          result.dead,
    }),
  );

  return new Response(
    JSON.stringify({ ...result, durationMs: duration, source }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
