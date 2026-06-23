// src/pages/api/indexnow.ts
// Endpoint interne déclenché à chaque rebuild (ou par cron) pour pousser
// l’intégralité du sitemap vers IndexNow. Limite: 10 000 URLs / requête (suffisant).

import type { APIRoute } from 'astro';
import { submitToIndexNow } from '@/lib/indexnow';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'https://biscuits-ia.com';
const ALLOWED_HOSTS = new Set([
  'biscuits-ia.com',
  'www.biscuits-ia.com',
  'localhost:4321',
]);

// Liste d’URLs à soumettre. En prod on léve le sitemap via fs (rapide),
// en dev on accepte une liste vide.
async function getSitemapUrls(): Promise<string[]> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    // Cherche le sitemap genere dans dist/client/sitemap-0.xml (apres build)
    // ou astro build output.
    const candidates = [
      'dist/client/sitemap-0.xml',
      'dist/sitemap-0.xml',
      '.vercel/output/static/sitemap-0.xml',
    ];
    for (const c of candidates) {
      try {
        const xml = fs.readFileSync(path.resolve(c), 'utf8');
        return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
      } catch {
        // continue
      }
    }
    return [];
  } catch {
    return [];
  }
}

export const POST: APIRoute = async () => {
  try {
    const urls = await getSitemapUrls();
    if (!urls.length) {
      return new Response(
        JSON.stringify({ error: 'sitemap_empty' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const host = new URL(SITE_URL).host;
    if (!ALLOWED_HOSTS.has(host)) {
      return new Response(
        JSON.stringify({ error: 'invalid_host', host }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const result = await submitToIndexNow({ urls, host });
    return new Response(
      JSON.stringify({ submitted: urls.length, result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'indexnow_error', message: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET = POST;
