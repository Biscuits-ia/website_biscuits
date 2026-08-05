import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  const authCode = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard/user';
  const errorParam = url.searchParams.get('error');

  // Handle OAuth/error callbacks from Supabase
  if (errorParam) {
    console.error('[callback] OAuth error:', errorParam);
    return redirect('/connexion?error=oauth');
  }

  // Validate `next`: only relative paths to prevent open redirects
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/user';

  if (!authCode) {
    return new Response('No code provided', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const supabase = createSupabaseClient({ request, cookies });
  const { error } = await supabase.auth.exchangeCodeForSession(authCode);

  if (error) {
    console.error('[callback] exchangeCodeForSession error:', error.message, '| code:', error.code);
    return redirect('/connexion?error=session');
  }

  // Return a proper Response with redirect status to ensure cookies are sent
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext,
    },
  });
};
