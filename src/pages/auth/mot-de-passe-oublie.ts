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

function getForwardedOrigin(request: Request): string | null {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (!forwardedProto || !forwardedHost) return null;

  return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
}

function getAuthRedirectOrigin(request: Request, url: URL, site: URL | undefined): string {
  // En dev, force localhost:4321 (port standard Astro)
  if (import.meta.env.DEV) {
    return 'http://localhost:4321';
  }

  const vercelProductionUrl = import.meta.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${import.meta.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const vercelPreviewUrl = import.meta.env.VERCEL_URL
    ? `https://${import.meta.env.VERCEL_URL}`
    : null;

  const forwarded = getForwardedOrigin(request);
  const normalized_url = normalizeOrigin(url);
  const normalized_site_env = normalizeOrigin(import.meta.env.SITE);
  const normalized_site_ctx = normalizeOrigin(site);
  const normalized_vercel_prod = normalizeOrigin(vercelProductionUrl);
  const normalized_vercel_prev = normalizeOrigin(vercelPreviewUrl);

  if (import.meta.env.DEV) {
    console.log('[ORIGIN_DEBUG] getForwardedOrigin:', forwarded);
    console.log('[ORIGIN_DEBUG] normalizeOrigin(url):', normalized_url);
    console.log('[ORIGIN_DEBUG] import.meta.env.SITE:', normalized_site_env);
    console.log('[ORIGIN_DEBUG] site context:', normalized_site_ctx);
    console.log('[ORIGIN_DEBUG] VERCEL_PROJECT_PRODUCTION_URL:', normalized_vercel_prod);
    console.log('[ORIGIN_DEBUG] VERCEL_URL:', normalized_vercel_prev);
  }

  const candidates = [
    forwarded,
    normalized_url,
    normalized_site_env,
    normalized_site_ctx,
    normalized_vercel_prod,
    normalized_vercel_prev,
  ];

  const origin = candidates.find((candidate): candidate is string => Boolean(candidate));

  if (!origin) {
    throw new Error('Impossible de déterminer l\'URL publique du site pour la réinitialisation de mot de passe.');
  }

  if (import.meta.env.DEV) {
    console.log('[ORIGIN_DEBUG] ✓ Selected origin:', origin);
  }

  return origin;
}

function getResetPasswordErrorMessage(errorMessage: string, redirectUrl: string): string {
  const normalizedMessage = errorMessage.toLowerCase();

  if (
    normalizedMessage.includes('redirect') ||
    normalizedMessage.includes('site_url') ||
    normalizedMessage.includes('site url') ||
    normalizedMessage.includes('not allowed')
  ) {
    return `Configuration Supabase invalide : autorisez ${redirectUrl} dans Auth > URL Configuration.`;
  }

  return 'Impossible d\'envoyer le lien. Veuillez réessayer.';
}

export const POST: APIRoute = async ({ request, cookies, url, site }) => {
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
  console.log('[DEBUG] Demande reset password pour:', email);
  console.log('[DEBUG] URL de redirection:', redirectUrl);

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    console.error('[DEBUG] Erreur resetPasswordForEmail:', error.message);
    
    // Mode debug: retourne la réponse complète pour investigation
    if (import.meta.env.DEV) {
      console.log('[DEBUG] Réponse complète error:', error);
      console.log('[DEBUG] Data:', data);
    }
    
    return new Response(
      JSON.stringify({ error: getResetPasswordErrorMessage(error.message, redirectUrl) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Si on arrive ici, c'est que ça a marché
  console.log('[DEBUG] ✅ Email sent successfully');

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
