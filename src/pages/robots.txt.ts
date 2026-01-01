// src/pages/robots.txt.ts
export async function GET() {
  const robotsTxt = `
User-agent: *
Allow: /

Sitemap: https://biscuits-ia.com/sitemap.xml
  `.trim();

  return new Response(robotsTxt, {
    headers: { 'Content-Type': 'text/plain' }
  });
}