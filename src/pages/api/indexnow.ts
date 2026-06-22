// src/pages/api/indexnow.ts
// Endpoint interne déclenché à chaque rebuild (ou par cron) pour pousser
// l'intégralité du sitemap vers IndexNow. Limite: 10 000 URLs / requête (suffisant).

import type { APIRoute } from 'astro';
import { submitToIndexNow, toAbsoluteUrls } from '@/lib/indexnow';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'https://biscuits-ia.com';

export const POST: APIRoute = async () => {
  try {
    const sitemapRes = await fetch(`${SITE_URL}/sitemap-0.xml`);
    if (!sitemapRes.ok) {
      return new Response(
        JSON.stringify({ error: 'sitemap_fetch_failed', status: sitemapRes.status }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const xml = await sitemapRes.text();
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    if (!urls.length) {
      return new Response(
        JSON.stringify({ error: 'sitemap_empty' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const result = await submitToIndexNow({ urls, host: new URL(SITE_URL).host });
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