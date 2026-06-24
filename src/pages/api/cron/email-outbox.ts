// ============================================================================
// src/pages/api/cron/email-outbox.ts
// ----------------------------------------------------------------------------
// Worker declenche par Vercel Cron (toutes les 2 minutes).
// Traite les emails en attente dans email_outbox, avec retry exponentiel.
//
// Authentification : Header `Authorization: Bearer ${CRON_SECRET}`.
// En local : curl -H "Authorization: Bearer xxx" http://localhost:4321/api/cron/email-outbox
// En prod : Vercel Cron envoie automatiquement la cle (config dans vercel.json).
// ============================================================================

import type { APIRoute } from 'astro';
import { processEmailOutbox } from '@/lib/email-queue';

export const POST: APIRoute = async ({ request }) => {
  return await runWorker(request);
};

export const GET: APIRoute = async ({ request }) => {
  return await runWorker(request);
};

async function runWorker(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = import.meta.env.CRON_SECRET;

  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const startTime = Date.now();
  let result;
  try {
    result = await processEmailOutbox();
  } catch (err) {
    console.error('[cron/email-outbox] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const duration = Date.now() - startTime;
  return new Response(
    JSON.stringify({ ...result, durationMs: duration }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}