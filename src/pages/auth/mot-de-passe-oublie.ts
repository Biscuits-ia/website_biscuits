import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

/**
 * Normalise une URL en un origin (scheme + host)
 * @see https://supabase.com/docs/guides/auth/redirect-urls
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
 * Utile pour les reverse proxies
 */
function getForwardedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!proto || !host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * Détermine l'origin de redirection pour les emails Supabase Auth
 * Suit la priorité recommandée par Supabase
 * @see https://supabase.com/docs/guides/auth/redirect-urls#overview
 */
function getAuthRedirectOrigin(request: Request, url: URL, site: URL | undefined): string {
  // Pour le développement local, utilise l'URL de la requête
  if (import.meta.env.DEV) {
    const origin = normalizeOrigin(url);
    if (origin) return origin;
  }

  // Production: priorité Vercel → Site config → Request URL
  const candidates = [
    // 1. Headers Vercel (X-Forwarded)
    getForwardedOrigin(request),
    // 2. Site URL configurée dans astro.config.mjs
    normalizeOrigin(import.meta.env.SITE),
    normalizeOrigin(site),
    // 3. VERCEL_PROJECT_PRODUCTION_URL (production)
    import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${import.meta.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    normalizeOrigin(import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ?? undefined),
  ];

  const origin = candidates.find((candidate): candidate is string => Boolean(candidate));
  if (!origin) {
    throw new Error(
      'Impossible de déterminer l\'URL publique. ' +
      'Assurez-vous que SITE est configuré dans astro.config.mjs ou VERCEL_PROJECT_PRODUCTION_URL en production.'
    );
  }

  return origin;
}

/**
 * Classifie les erreurs Supabase Auth pour afficher un message approprié
 */
function getErrorMessage(errorMessage: string, redirectUrl: string): string {
  const msg = errorMessage.toLowerCase();

  // Erreur de configuration (redirectUrl non autorisée)
  if (msg.includes('redirect') || msg.includes('site_url') || msg.includes('not allowed')) {
    return (
      `Configuration Auth invalide : autorisez cette URL dans Supabase → ` +
      `Authentication → URL Configuration\n\nURL à ajouter : ${redirectUrl}`
    );
  }

  // Erreur d'email (pas de provider configuré)
  if (msg.includes('email')) {
    return (
      `Service d'email non configuré. ` +
      `Veuillez vérifier la configuration Supabase → Authentication → Email Provider.`
    );
  }

  // Erreur générique
  return 'Impossible d\'envoyer le lien. Veuillez réessayer plus tard.';
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
        JSON.stringify({ error: getErrorMessage(error.message, redirectUrl) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email envoyé. Vérifiez votre boîte de réception.' }),
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
