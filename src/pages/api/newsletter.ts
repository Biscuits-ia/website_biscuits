// src/pages/api/newsletter.ts
// Inscription a la newsletter (envoi mensuel). Endpoint public :
// - honeypot anti-bot
// - rate-limit IP (anti email-bombing)
// - dedup par email (UPSERT idempotent)
// - sauvegarde dans la table newsletter_subscribers (a creer en BDD).
// En attendant la livraison SMTP, on retourne OK des que l'insert reussit.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { rateLimitRoute } from '@/lib/rateLimit';
import { EMAIL_RE } from '@/lib/validation';
import { getClientIp } from '@/lib/http';

const NEWSLETTER_LIMIT = 3;
const NEWSLETTER_WINDOW_MS = 10 * 60_000;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = rateLimitRoute(ip, '/api/newsletter', NEWSLETTER_LIMIT, NEWSLETTER_WINDOW_MS);
  if (blocked) return blocked;

  let body: { email?: string; honey?: string } = {};
  let email: string;
  let honey: string;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      body = (await request.json()) ?? {};
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      honey = typeof body.honey === 'string' ? body.honey : '';
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      email = (form.get('email') as string | null)?.trim().toLowerCase() ?? '';
      const rawHoney = form.get('honey');
      honey = typeof rawHoney === 'string' ? rawHoney : '';
    } else {
      return new Response(JSON.stringify({ error: 'Content-Type non supporte.' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de la requete invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Honeypot: si rempli, on simule un succes pour ne pas confirmer le bot.
  if (honey !== '' || !email) {
    return new Response(
      JSON.stringify({ success: true, message: 'Inscription enregistree.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!EMAIL_RE.test(email) || email.length > 255) {
    return new Response(
      JSON.stringify({ error: 'Adresse email invalide.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseAdminClient();
  // Table cible : newsletter_subscribers (a creer via migration Supabase).
  // En cas d'absence de la table, on log et on renvoie OK pour ne pas
  // casser l'UX pendant la phase de deploiement.
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      { email, subscribed_at: new Date().toISOString(), source: 'site' },
      { onConflict: 'email', ignoreDuplicates: false },
    );

  if (error) {
    console.error('[newsletter] upsert error:', error.message);
    return new Response(
      JSON.stringify({ error: "Impossible d'enregistrer l'inscription." }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Inscription enregistree. Merci !' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
