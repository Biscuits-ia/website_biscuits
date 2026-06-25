// src/middleware.ts

import { defineMiddleware } from 'astro:middleware';
import { rateLimit } from './lib/rateLimit';
import { getClientIpOrNull } from './lib/http';
import { createSupabaseClient, createSupabaseAdminClient } from './lib/supabase';
import crypto from 'node:crypto';

const LOGOUT_CACHE_TTL_MS = 30_000;
interface LogoutCacheEntry {
  lastLogoutAtMs: number | null;
  expiresAt: number;
}
const logoutCache = new Map<string, LogoutCacheEntry>();

const PUBLIC_AUTH_PATHS = new Set([
  '/connexion',
  '/inscription',
  '/auth/connexion',
  '/auth/inscription',
  '/auth/callback',
  '/auth/confirm',
  '/auth/verifier-token-inscription',
  '/auth/mot-de-passe-oublie',
  '/auth/reinitialiser-mot-de-passe',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_AUTH_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/favicon')) return true;
  return false;
}

function checkRouteRateLimit(
  context: { request: Request; clientAddress?: string },
  isDev: boolean,
  pathname: string,
): Response | null {
  if (isDev) return null;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return null;

  const ip = getClientIpOrNull(context.request, context.clientAddress);
  if (!ip) return null;

  let limit = 20;
  let windowMs = 60_000;

  if (pathname === '/api/appointment-slots' || pathname === '/api/user-appointments') limit = 30;

  if (pathname.startsWith('/auth/')) {
    if (pathname === '/auth/connexion' || pathname === '/auth/inscription') {
      limit = 5;
    } else if (
      ['/auth/confirm', '/auth/callback', '/auth/verifier-token-inscription'].includes(pathname)
    ) {
      limit = 30;
    } else if (pathname === '/auth/mot-de-passe-oublie') {
      limit = 10;
      windowMs = 5 * 60_000;
    } else {
      limit = 12;
    }
  }

  return rateLimit(`${ip}:${pathname}`, limit, windowMs);
}

async function readLastLogoutAtMs(userId: string): Promise<number | null> {
  const cached = logoutCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.lastLogoutAtMs;

  let value: number | null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('last_logout_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      value = error.code === '42703' ? 0 : null;
      if (error.code !== '42703') console.error('[middleware] readLastLogoutAtMs:', error.message);
    } else {
      const ms = data?.last_logout_at ? Date.parse(data.last_logout_at) : 0;
      value = Number.isFinite(ms) ? ms : null;
    }
  } catch (err) {
    console.error('[middleware] readLastLogoutAtMs exception:', err);
    return null;
  }

  logoutCache.set(userId, { lastLogoutAtMs: value, expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS });
  return value;
}

/**
 * Guard de session avec gestion de refresh_token_not_found.
 * 
 * CORRECTIONS :
 * - Catch de refresh_token_not_found dans getUser()
 * - Si erreur → déconnexion propre via signOut()
 * - Suppression du code mort (void cookieHeader, etc.)
 */
async function handleSessionGuard(
  supabase: ReturnType<typeof createSupabaseClient>,
  pathname: string,
): Promise<'ok' | 'invalidated' | 'unauthenticated'> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    // ✅ Gestion de refresh_token_not_found
    if (error) {
      if (error.code === 'refresh_token_not_found' || error.status === 400) {
        console.warn('[middleware] refresh_token_not_found → déconnexion');
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        return 'invalidated';
      }
      return 'unauthenticated';
    }
    
    if (!user) {
      return 'unauthenticated';
    }

    const lastLogoutAtMs = await readLastLogoutAtMs(user.id);
    if (lastLogoutAtMs === null || lastLogoutAtMs === 0) return 'ok';

    const fiveMinAgo = Date.now() - 5 * 60_000;
    if (lastLogoutAtMs > fiveMinAgo) return 'invalidated';

    return 'ok';
  } catch (err: any) {
    // ✅ Catch des erreurs non gérées
    if (err?.code === 'refresh_token_not_found' || err?.status === 400) {
      console.warn('[middleware] refresh_token_not_found (catch) → déconnexion');
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      return 'invalidated';
    }
    console.error('[middleware] handleSessionGuard exception:', err);
    return 'ok';
  }
}