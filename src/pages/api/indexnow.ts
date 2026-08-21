// src/pages/api/indexnow.ts
// Endpoint interne déclenché à chaque rebuild (ou par cron) pour pousser
// l’intégralité du sitemap vers IndexNow. Limite: 10 000 URLs / requête (suffisant).

import type { APIRoute } from 'astro';
import { submitToIndexNow } from '@/lib/indexnow';
import { verifyBearer } from '@/lib/secrets';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'https://biscuits-ia.com';
const ALLOWED_HOSTS = new Set(['biscuits-ia.com', 'www.biscuits-ia.com', 'localhost:4321']);

// Liste d'URLs à soumettre, lue via HTTP sur le sitemap déjà déployé.
//
// L'ancienne version lisait dist/client/sitemap-0.xml sur le filesystem :
// ça marche en local (`astro build` laisse dist/ sur disque), mais jamais
// sur Vercel -- le bundle d'une Function ne contient pas les artefacts de
// build, seulement le code. Chaque appel en prod retombait donc sur une
// liste vide et un 502 systematique.
async function getSitemapUrls(siteUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${siteUrl}/sitemap-0.xml`);
    if (!res.ok) return [];
    const xml = await res.text();
    return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  } catch {
    return [];
  }
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.INDEXNOW_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'service_unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!verifyBearer(request.headers.get('authorization'), secret)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const urls = await getSitemapUrls(SITE_URL);
    if (!urls.length) {
      return new Response(JSON.stringify({ error: 'sitemap_empty' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const host = new URL(SITE_URL).host;
    if (!ALLOWED_HOSTS.has(host)) {
      return new Response(JSON.stringify({ error: 'invalid_host', host }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await submitToIndexNow({ urls, host });
    return new Response(JSON.stringify({ submitted: urls.length, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/indexnow] submission failed:', err);
    return new Response(JSON.stringify({ error: 'indexnow_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
