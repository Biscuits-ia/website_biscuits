export const prerender = true;

const routes = [
  '/',
  '/atelier-ia',
  '/devis',
  '/guides-ressources',
  '/pourquoi-biscuits-ia',
  '/projects-collaboratif',
  '/services',
  '/tarifs',
  // Blog index and posts (generated from MDX)
  '/blog',
  '/blog/ci',
  '/blog/ia',
  // Legal pages
  '/legal/confidentialite',
  '/legal/cookies',
  '/legal/mentions-legales',
  // Combat pages
  '/combats/arnaques-numeriques',
  '/combats/ia-accessible',
  '/combats/ia-utile',
  '/combats/partage-connaissance',
  '/combats/plateformes-ouvertes',
];

export async function GET() {
  const base = import.meta.env.SITE || 'https://biscuits.dev';
  const urls = routes
    .map((route) => {
      const loc = `${base}${route}`;
      const lastmod = new Date().toISOString().split('T')[0];
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
