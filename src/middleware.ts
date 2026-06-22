// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { createSupabaseAdminClient, createSupabaseClient } from './lib/supabase';
import { fetchRoleSecure } from './lib/auth';
import crypto from 'node:crypto';

function parseForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  return first;
}

function getClientIp(context: Parameters<typeof defineMiddleware>[0] extends never ? never : any): string | null {
  const fromCf = context.request.headers.get('cf-connecting-ip');
  const fromRealIp = context.request.headers.get('x-real-ip');
  const fromForwarded = parseForwardedFor(context.request.headers.get('x-forwarded-for'));
  const fromAstro = typeof context.clientAddress === 'string' ? context.clientAddress : null;

  const ip = fromCf ?? fromRealIp ?? fromForwarded ?? fromAstro;
  if (!ip) return null;

  const normalized = ip.trim();
  if (!normalized || normalized === 'unknown') return null;
  return normalized;
}

function readAccessTokenIssuedAtMs(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { iat?: unknown };
    if (typeof payload.iat !== 'number') return null;
    return payload.iat * 1000;
  } catch {
    return null;
  }
}

function checkRouteRateLimit(context: any, isDev: boolean, pathname: string): Response | null {
  if (isDev) return null;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return null;

  const ip = getClientIp(context);
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

  if (pathname.startsWith('/auth/')) {
    if (
      pathname === '/auth/inscription'
      || pathname === '/auth/confirm'
      || pathname === '/auth/callback'
      || pathname === '/auth/verifier-token-inscription'
    ) {
      limit = 30;
    } else if (pathname === '/auth/mot-de-passe-oublie') {
      windowMs = 5 * 60_000;
    } else {
      limit = 12;
    }
  }

  const key = `${ip}:${pathname}`;
  return rateLimit(key, limit, windowMs);
}

async function mustInvalidateSession(supabase: ReturnType<typeof createSupabaseClient>): Promise<boolean> {
  try {
    // 1. SECURITY: verify the JWT signature against Supabase FIRST.
    //    getUser() makes a server-side roundtrip to Supabase Auth; if the
    //    cookie's JWT is forged, unsigned, or revoked, this call fails and
    //    we never trust the local payload claims. The previous implementation
    //    read `iat` from the raw base64 payload without verifying the
    //    signature, allowing an attacker who knew a user's id to forge a
    //    cookie with an arbitrary `iat` and bypass this check.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;

    // 2. The JWT is now server-verified. Reading the iat from the
    //    unverified base64 payload is safe because we know Supabase
    //    issued this exact token.
    const { data: { session } } = await supabase.auth.getSession();
    const accessTokenIssuedAtMs = readAccessTokenIssuedAtMs(session?.access_token);
    if (accessTokenIssuedAtMs === null) return false;

    // 3. Compare iat to last_logout_at in the profile (DB = source of
    //    truth for explicit logout). If iat <= last_logout_at, the
    //    access token was issued at or before the user's last logout and
    //    must be invalidated.
    const adminSupabase = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('last_logout_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      const columnMissing = profileError.code === '42703';
      if (!columnMissing) {
        console.error('[middleware] profile fetch for session invalidation failed:', profileError.message);
      }
      return false;
    }

    if (!profile?.last_logout_at) return false;
    const lastLogoutAtMs = Date.parse(profile.last_logout_at);
    return Number.isFinite(lastLogoutAtMs) && accessTokenIssuedAtMs <= lastLogoutAtMs;
  } catch {
    // Token refresh or profile fetch failed: keep request flow and treat as non-invalidated here.
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const isDev = import.meta.env.DEV;

  // Skip middleware for prerendered static routes (RSS feed, etc.)
  // The middleware cannot access request.headers on prerendered pages.
  if (url.pathname === '/rss.xml') {
    return next();
  }

  const blocked = checkRouteRateLimit(context, isDev, url.pathname);
  if (blocked) return blocked;

  // Generate a per-request CSP nonce
  const nonce = crypto.randomBytes(16).toString('base64');
  context.locals.nonce = nonce;

  // Create Supabase client and store in locals for reuse by requireAuth() and pages.
  // This ensures that if the token is refreshed here, the same client (with the new
  // token in memory) is used in pages — not a new client with the old cookie.
  const supabase = createSupabaseClient(context);

  const invalidatedSession = await mustInvalidateSession(supabase);

  if (invalidatedSession) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore cookie cleanup errors and continue with forced logout response.
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Session invalidee. Merci de vous reconnecter.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (!url.pathname.startsWith('/auth/')) {
      return context.redirect('/connexion?session=invalidee');
    }
  }

  context.locals.supabase = supabase;

  const response = await next();

  // Set CSP header with nonce (replaces static vercel.json CSP)
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'sha256-3bzWVxQE32IZQKH9eh8KzyHuhXOlMrboDVVBRd0fWTU='",
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://cdn.vercel-insights.com',
    'https://*.vercel.app',
    'https://vercel.live',
    'https://cdn.jsdelivr.net',
  ];

  const connectSrc = [
    "'self'",
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://*.vercel-insights.com',
    'https://*.supabase.co',
    'https://cdn.jsdelivr.net',
  ];

  const frameSrc = [
    'https://www.googletagmanager.com',
    'https://vercel.live',
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
    `frame-src ${frameSrc.join(' ')}`,
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
    // Add a nonce to every inline <script> tag.
    // Matching the full opening tag is more reliable than trying to exclude
    // `src=` with lookbehinds because Astro can emit several script variants.
    html = html.replaceAll(/<script\b([^>]*)>/g, (match, attrs: string) => {
      if (/\bsrc\s*=/.test(attrs) || /\bnonce\s*=/.test(attrs)) {
        return match;
      }

      return `<script${attrs} nonce="${nonce}">`;
    });
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
