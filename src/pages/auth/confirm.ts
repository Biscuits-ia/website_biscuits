import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';

function getSafeNext(next: string | null): string {
  if (!next) return '/dashboard/user';
  if (!next.startsWith('/')) return '/dashboard/user';
  if (next.startsWith('//')) return '/dashboard/user';
  return next;
}

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const next = getSafeNext(url.searchParams.get('next'));

  const supabase = createSupabaseClient({ request, cookies });

  // Support links that arrive with auth code flow.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next);
    return redirect('/connexion?error=confirmation');
  }

  // Support links that use token_hash + type (Supabase docs default for /auth/confirm).
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) return redirect(next);
  }

  return redirect('/connexion?error=confirmation');
};
