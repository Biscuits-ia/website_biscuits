import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { rateLimitRoute } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';
import { EMAIL_RE } from '@/lib/validation';

const JSON_HDR = { 'Content-Type': 'application/json' } as const;

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
 * Recupere l'origin depuis les headers X-Forwarded (Vercel, nginx, etc.)
 */
function getForwardedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!proto || !host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * Determine l'origin de redirection pour les emails
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
    throw new Error('Impossible de determiner l\'URL publique. Assurez-vous que SITE est configure.');
  }

  return origin;
}

function getErrorMessage(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('rate') || msg.includes('limit')) return 'Trop d\'emails envoyes. Attendez quelques minutes avant de reessayer.';
  if (msg.includes('not allowed') || msg.includes('redirect')) return 'Configuration incorrecte. Contactez le support.';
  if (msg.includes('user not found') || msg.includes('no user')) return 'Aucun compte trouve pour cet email.';
  return 'Impossible d\'envoyer le code de reinitialisation. Veuillez reessayer.';
}

export const POST: APIRoute = async ({ request, cookies, url, site, clientAddress }) => {
  // 1. Rate-limit IP avant tout parsing (anti email-bombing).
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = rateLimitRoute(ip, '/api/auth/mot-de-passe-oublie', 3, 10 * 60_000);
  if (blocked) return blocked;

  try {
    const formData = await request.formData();
    const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Veuillez entrer votre adresse email.' }),
        { status: 400, headers: JSON_HDR },
      );
    }

    // Validation email cote serveur (defense in depth).
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail) || trimmedEmail.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Adresse email invalide.' }),
        { status: 400, headers: JSON_HDR },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });
    const origin = getAuthRedirectOrigin(request, url, site);

    // FIX P0 : on precise le redirectTo pour que le lien dans l'email
    // pointe vers /auth/confirm sur notre domaine (et pas sur le dashboard
    // Supabase sandbox/prod).
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${origin}/auth/confirm?type=recovery`,
    });

    if (error) {
      console.error('[Auth] resetPasswordForEmail error:', error.message, '| code:', error.code);
      return new Response(
        JSON.stringify({ error: getErrorMessage(error.message) }),
        { status: 400, headers: JSON_HDR },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email envoye. Verifiez votre boite de reception pour recuperer le code.',
      }),
      { status: 200, headers: JSON_HDR },
    );
  } catch (err) {
    console.error('[Auth] Password reset error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: JSON_HDR },
    );
  }
};
