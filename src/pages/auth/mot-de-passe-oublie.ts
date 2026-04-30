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
 * Classifie les erreurs Supabase pour le reset de mot de passe
 */
function getErrorMessage(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('rate') || msg.includes('limit')) return 'Trop d\'emails envoyés. Attendez quelques minutes avant de réessayer.';
  if (msg.includes('not allowed') || msg.includes('redirect')) return 'Configuration incorrecte. Contactez le support.';
  if (msg.includes('user not found') || msg.includes('no user')) return 'Aucun compte trouvé pour cet email.';
  return 'Impossible d\'envoyer le code de réinitialisation. Veuillez réessayer.';
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

    // Flow OTP: l'email doit contenir {{ .Token }} pour la saisie manuelle du code.
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      console.error('[Auth] resetPasswordForEmail error:', error.message, '| code:', error.code);
      return new Response(
        JSON.stringify({ error: getErrorMessage(error.message) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email envoyé. Vérifiez votre boîte de réception pour récupérer le code.',
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
