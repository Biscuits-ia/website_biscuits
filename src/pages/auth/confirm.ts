import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';

function getSafeNext(next: string | null): string {
  if (!next) return '/dashboard/user';
  if (!next.startsWith('/')) return '/dashboard/user';
  if (next.startsWith('//')) return '/dashboard/user';
  // Block internal paths that shouldn't be redirect targets
  if (next.startsWith('/api/') || next.startsWith('/auth/')) return '/dashboard/user';
  return next;
}

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const next = getSafeNext(url.searchParams.get('next'));

  console.log('[confirm] Received request:', {
    tokenHash: tokenHash ? 'present' : 'missing',
    type,
    code: code ? 'present' : 'missing',
    next,
    fullUrl: url.toString(),
  });

  const supabase = createSupabaseClient({ request, cookies });

  // Flow 1: PKCE code exchange (preferred for production)
  if (code) {
    console.log('[confirm] Exchanging auth code for session');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[confirm] exchangeCodeForSession error:', error.message, '| code:', error.code);
      return redirect('/connexion?error=confirmation&code=exchange_failed');
    }
    console.log('[confirm] Session exchanged successfully, redirecting to', next);
    // Return a proper Response with redirect status to ensure cookies are sent
    return new Response(null, {
      status: 302,
      headers: {
        Location: next,
      },
    });
  }

  // Flow 2: OTP token_hash verification (for email links: signup, recovery, magic link)
  if (tokenHash && type) {
    console.log('[confirm] Verifying OTP token_hash:', type);

    // Validate type is one of the expected values
    const validTypes: EmailOtpType[] = ['signup', 'recovery', 'magiclink', 'email_change', 'email'];
    if (!validTypes.includes(type)) {
      console.error('[confirm] Invalid OTP type:', type);
      return redirect('/connexion?error=confirmation&code=invalid_type');
    }

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      console.error('[confirm] verifyOtp error:', error.message, '| code:', error.code, '| type:', type);

      // Map error codes to user-friendly messages
      let errorCode = 'verify_failed';
      if (error.code === 'otp_expired' || error.message.includes('expired')) {
        errorCode = 'expired';
      } else if (error.code === 'otp_invalid' || error.message.includes('invalid')) {
        errorCode = 'invalid';
      } else if (error.code === 'session_missing') {
        errorCode = 'session_missing';
      }

      return redirect(`/connexion?error=confirmation&code=${errorCode}`);
    }

    console.log('[confirm] OTP verified successfully, redirecting to', next);
    return new Response(null, {
      status: 302,
      headers: {
        Location: next,
      },
    });
  }

  console.warn('[confirm] Invalid confirmation request - missing token_hash/type or code');
  return redirect('/connexion?error=confirmation&code=invalid_request');
};
