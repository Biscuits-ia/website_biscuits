import type { APIRoute } from 'astro';
import type { AuthResponse } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';

function normalizeOrigin(value: string | URL | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = value instanceof URL ? value : new URL(value);
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getForwardedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!proto || !host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

function getAuthRedirectOrigin(request: Request, url: URL, site: URL | undefined): string {
  if (import.meta.env.DEV) {
    const origin = normalizeOrigin(url);
    if (origin) return origin;
  }

  const candidates = [
    getForwardedOrigin(request),
    normalizeOrigin(import.meta.env.SITE),
    normalizeOrigin(site),
    import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${import.meta.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
  ];

  const origin = candidates.find((candidate): candidate is string => Boolean(candidate));
  if (!origin) {
    throw new Error('Impossible de déterminer l\'URL publique. Assurez-vous que SITE est configuré.');
  }

  return origin;
}

function isRedirectUrlError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('redirect') ||
    msg.includes('allow list') ||
    msg.includes('allowlist') ||
    msg.includes('whitelist') ||
    msg.includes('uri')
  );
}

function mapSignupError(message: string): string {
  const msg = message.toLowerCase();

  if (msg.includes('already') || msg.includes('registered')) {
    return 'Cet email est deja inscrit. Essayez de vous connecter.';
  }
  if (msg.includes('password')) {
    return 'Mot de passe invalide. Utilisez au moins 8 caracteres.';
  }
  if (msg.includes('signup') && msg.includes('disabled')) {
    return 'Les inscriptions sont actuellement desactivees.';
  }
  if (msg.includes('rate') || msg.includes('security purposes') || msg.includes('too many')) {
    return 'Trop de tentatives. Reessayez dans quelques minutes.';
  }
  if (isRedirectUrlError(msg)) {
    return 'Configuration de redirection invalide. Contactez l\'administrateur.';
  }

  return 'Impossible de creer le compte. Veuillez reessayer.';
}

function buildSignupOutcome(signupResult: AuthResponse): Response | null {
  if (signupResult.error) {
    console.error('[Auth] signUp error:', signupResult.error.message);
    return new Response(
      JSON.stringify({ error: mapSignupError(signupResult.error.message) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const identities = signupResult.data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Cet email est deja inscrit. Essayez de vous connecter.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return null;
}

export const POST: APIRoute = async ({ request, cookies, url, site }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuration Supabase manquante (SUPABASE_URL/SUPABASE_ANON_KEY).' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const formData = await request.formData();
    const email    = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
    const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email et mot de passe requis.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });

    let emailRedirectTo: string | undefined;
    try {
      const origin = getAuthRedirectOrigin(request, url, site);
      emailRedirectTo = `${origin}/auth/callback`;
    } catch (originError) {
      // Fallback: keep signup functional even if public origin cannot be derived.
      console.warn('[Auth] Signup redirect origin unresolved, fallback without emailRedirectTo:', originError);
    }

    let signupResult = await supabase.auth.signUp({
      email,
      password,
      ...(emailRedirectTo
        ? {
            options: {
              emailRedirectTo,
            },
          }
        : {}),
    });

    if (signupResult.error && emailRedirectTo && isRedirectUrlError(signupResult.error.message)) {
      console.warn('[Auth] Signup retry without emailRedirectTo due to redirect URL error:', signupResult.error.message);
      signupResult = await supabase.auth.signUp({ email, password });
    }

    const outcome = buildSignupOutcome(signupResult);
    if (outcome) return outcome;

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] inscription route error:', err);
    const message = err instanceof Error ? err.message : '';
    return new Response(
      JSON.stringify({
        error: message
          ? `Erreur serveur: ${message}`
          : 'Erreur serveur. Veuillez reessayer.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};