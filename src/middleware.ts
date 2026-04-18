// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import crypto from 'node:crypto';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const isDev = import.meta.env.DEV;

  // Rate-limit API routes and auth routes
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    const ip = context.clientAddress ?? context.request.headers.get('x-forwarded-for') ?? 'unknown';
    // Auth routes get a stricter limit to prevent brute-force attacks
    const isAuth = url.pathname.startsWith('/auth/');
    const blocked = rateLimit(ip, isAuth ? 10 : 20, 60_000);
    if (blocked) return blocked;
  }

  // Generate a per-request CSP nonce
  const nonce = crypto.randomBytes(16).toString('base64');
  context.locals.nonce = nonce;

  const response = await next();

  // Set CSP header with nonce (replaces static vercel.json CSP)
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    'https://challenges.cloudflare.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://vercel.live',
    'https://cdn.jsdelivr.net',
  ];

  const connectSrc = [
    "'self'",
    'https://challenges.cloudflare.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://*.vercel-insights.com',
    'https://*.supabase.co',
    'https://cdn.jsdelivr.net',
  ];

  if (isDev) {
    connectSrc.push('http://localhost:4321', 'ws://localhost:4321', 'http://127.0.0.1:4321', 'ws://127.0.0.1:4321');
  }

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-src https://challenges.cloudflare.com https://www.googletagmanager.com https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Inject nonce into Astro-generated inline module scripts.
  // Astro's SSR renderer outputs `<script type="module">content</script>` for
  // inlined scripts (no imports that create separate chunks). These lack a nonce
  // attribute, so they are blocked by the CSP. We patch the HTML response here.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    let html = await response.text();
    // Match <script type="module"> without any src= attribute (inline scripts only)
    html = html.replaceAll(
      '<script type="module">',
      `<script type="module" nonce="${nonce}">`,
    );
    // Also match regular <script> tags (inline)
    html = html.replace(/<script>(?![\s\S]*src=)/g, `<script nonce="${nonce}">`);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
