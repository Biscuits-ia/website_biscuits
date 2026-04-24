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

export const POST: APIRoute = async ({ request, cookies, url, site }) => {
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
  const origin = getAuthRedirectOrigin(request, url, site);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Impossible de créer le compte. Veuillez réessayer.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};