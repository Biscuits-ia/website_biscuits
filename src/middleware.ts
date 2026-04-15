// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import crypto from 'node:crypto';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, clientAddress } = context;

  // Rate-limit API routes only
  if (url.pathname.startsWith('/api/')) {
    const ip = clientAddress ?? context.request.headers.get('x-forwarded-for') ?? 'unknown';
    const blocked = rateLimit(ip, 20, 60_000); // 20 requests / minute per IP
    if (blocked) return blocked;
  }

  // Generate a per-request CSP nonce
  const nonce = crypto.randomBytes(16).toString('base64');
  context.locals.nonce = nonce;

  const response = await next();

  // Set CSP header with nonce (replaces static vercel.json CSP)
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.vercel-insights.com https://*.vercel.app https://vercel.live https://cdn.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.google-analytics.com https://analytics.google.com https://*.vercel-insights.com https://*.cloudflare.com https://*.supabase.co https://cdn.jsdelivr.net",
    "frame-src https://www.googletagmanager.com https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
