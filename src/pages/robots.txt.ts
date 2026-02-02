export const prerender = true;

export async function GET() {
  const siteUrl = import.meta.env.SITE || 'https://biscuits.dev';
  const robotsTxt = `
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: CCBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-Web
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
  `.trim();

  return new Response(robotsTxt, {
    headers: { 
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}
