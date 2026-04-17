import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { sendEmail } from '@/lib/resend';

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
 * Classifie les erreurs pour afficher un message approprié
 */
function getErrorMessage(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('user')) return 'Cet email n\'existe pas dans notre système.';
  if (msg.includes('email') || msg.includes('rate')) return 'Une erreur est survenue. Veuillez réessayer.';
  return 'Impossible d\'envoyer le lien. Veuillez réessayer.';
}

/**
 * Génère un token de récupération via l'API Supabase (sans envoyer d'email)
 */
async function generatePasswordRecoveryToken(email: string, redirectUrl: string): Promise<string | null> {
  try {
    // Appel direct à l'API Supabase pour obtenir un lien de récupération
    const response = await fetch(`${import.meta.env.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        redirect_to: redirectUrl,
      }),
    });

    // Supabase retourne généralement le lien dans la réponse
    const data = await response.json();
    
    // Si la réponse contient un lien direct, on l'utilise
    if (data.recovery_link) {
      return data.recovery_link;
    }

    // Sinon, on construit le lien manuellement avec les paramètres Supabase
    // Le token est fourni par Supabase dans l'URL ou dans la réponse
    if (data.token) {
      return `${redirectUrl}?token=${data.token}&type=recovery`;
    }

    return null;
  } catch (error) {
    console.error('[Supabase] Recovery token generation error:', error);
    return null;
  }
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

    const origin = getAuthRedirectOrigin(request, url, site);
    const redirectUrl = `${origin}/reinitialisation-mot-de-passe`;

    // Génère le lien via Supabase
    const recoveryLink = await generatePasswordRecoveryToken(email, redirectUrl);

    if (!recoveryLink) {
      console.error('[Auth] Failed to generate recovery token');
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la génération du lien. Veuillez réessayer.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Envoie l'email via Resend (meilleure délivrabilité avec SPF/DKIM/DMARC)
    try {
      await sendEmail({
        template: 'password-reset',
        email,
        confirmationUrl: recoveryLink,
      });

      console.log(`[Email] Password reset email sent to ${email}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email envoyé. Vérifiez votre boîte de réception (et les spams).',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } catch (emailError) {
      console.error('[Resend] Email send error:', emailError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    console.error('[Auth] Password reset error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
