import type { APIRoute } from 'astro';
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

function resolvePublicOrigin(url: URL): string {
  const devOrigin = normalizeOrigin(url);
  const configuredSite = normalizeOrigin(import.meta.env.SITE);
  return configuredSite ?? devOrigin ?? url.origin;
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
  if (msg.includes('redirect') || msg.includes('allow list') || msg.includes('allowlist') || msg.includes('uri')) {
    return 'Configuration de redirection invalide. Contactez l\'administrateur.';
  }

  return 'Impossible de creer le compte. Veuillez reessayer.';
}

export const POST: APIRoute = async ({ request, cookies, url }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuration Supabase manquante (SUPABASE_URL/SUPABASE_ANON_KEY).' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const formData = await request.formData();
    const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
    const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email et mot de passe requis.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });
    const emailRedirectTo = `${resolvePublicOrigin(url)}/auth/callback`;

    const signupResult = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (signupResult.error) {
      console.error('[Auth] signUp error:', signupResult.error.message);
      return new Response(
        JSON.stringify({ error: mapSignupError(signupResult.error.message) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Supabase can mask existing accounts by returning user with empty identities.
    const identities = signupResult.data.user?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Cet email est deja inscrit. Essayez de vous connecter.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] inscription route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
