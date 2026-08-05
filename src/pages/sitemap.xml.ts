import type { APIRoute } from 'astro';

export const prerender = true;

const SITE_ORIGIN = 'https://biscuits-ia.com';

/**
 * Point d'entree conventionnel attendu par les moteurs et les outils SEO.
 * @astrojs/sitemap conserve sitemap-index.xml + sitemap-0.xml pour pouvoir
 * segmenter automatiquement le site lorsqu'il grandira.
 */
export const GET: APIRoute = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      `<sitemap><loc>${SITE_ORIGIN}/sitemap-0.xml</loc></sitemap>` +
      `</sitemapindex>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=3600, must-revalidate',
      },
    }
  );
