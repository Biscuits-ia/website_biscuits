import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

/**
 * Normalise une URL en un origin (scheme + host)
 */
function normalizeOrigin(value: string | URL | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = value instanceof URL ? value : new URL(value);
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Récupère l'origin depuis les headers X-Forwarded (Vercel, nginx, etc.)
 */
function getForwardedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!proto || !host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * Détermine l'origin de redirection pour les emails
 */
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

/**
 * Classifie les erreurs
 */
function getErrorMessage(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('user')) return 'Cet email n\'existe pas dans notre système.';
  if (msg.includes('email') || msg.includes('rate')) return 'Une erreur est survenue. Veuillez réessayer.';
  return 'Impossible d\'envoyer le lien. Veuillez réessayer.';
}

export const POST: APIRoute = async ({ request, cookies, url, site }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Veuillez entrer votre adresse email.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });
    const origin = getAuthRedirectOrigin(request, url, site);
    const redirectUrl = `${origin}/reinitialisation-mot-de-passe`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      console.error('[Auth] resetPasswordForEmail error:', error.message);
      return new Response(
        JSON.stringify({ error: getErrorMessage(error.message) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email envoyé. Vérifiez votre boîte de réception.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] Password reset error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
