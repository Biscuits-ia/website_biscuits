// ============================================================================
// src/pages/api/legal/accept.ts
// ----------------------------------------------------------------------------
// Enregistre l\'acceptation d\'un document legal (CGV, CGU, etc.) par un user.
// Endpoint POST : pas de paiement necessaire, juste la trace juridique.
// ============================================================================

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getClientIp } from '@/lib/http';
import { createHash } from 'node:crypto';

const schema = z.object({
  document_type: z.enum(['cgu', 'rgpd']),
  document_version: z.string().min(1).max(20),
  context: z.enum(['payment', 'registration', 'manual']).default('manual'),
  registration_id: z.string().uuid().optional(),
});

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si pas connecte, on accepte quand meme mais on stocke l\'email
  if (!user) {
    // Pour les acceptations anonymes (avant inscription), on peut quand meme
    // stocker l\'IP hash et le user agent pour preuve. Mais on a besoin d\'un
    // identifiant. On refuse l\'acceptation anonyme pour CGV (preuve juridique faible).
    return new Response(
      JSON.stringify({ error: 'Vous devez etre connecte pour accepter un document legal.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse le body (form ou json)
  let body: Record<string, unknown>;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
    }
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries());
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Hash de l\'IP (RGPD : on ne stocke pas l\'IP en clair).
  //
  // getClientIp() ne lit que `x-vercel-forwarded-for` (ecrase par la plateforme)
  // et `clientAddress`. L\'ancienne version lisait `cf-connecting-ip` puis
  // `x-forwarded-for`, deux headers librement choisis par l\'appelant : la trace
  // juridique enregistrait donc l\'IP que le client voulait bien lui donner.
  // Cf. src/lib/http.ts.
  const ip = getClientIp(request, clientAddress as string | undefined);
  const ipHash = createHash('sha256').update(ip).digest('hex');

  // User agent tronque (256 chars max)
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 256);

  // Insert
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('legal_acceptance')
    .insert({
      user_id: user.id,
      document_type: parsed.data.document_type,
      document_version: parsed.data.document_version,
      context: parsed.data.context,
      registration_id: parsed.data.registration_id ?? null,
      ip_hash: ipHash,
      user_agent: userAgent,
      email: user.email ?? null,
      accepted_at: new Date().toISOString(),
    })
    .select('id, accepted_at')
    .single();

  if (error || !data) {
    console.error('[legal/accept] insert error:', error?.message);
    return new Response(JSON.stringify({ error: "Erreur lors de l'enregistrement." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Si on est dans un contexte de formulaire (Content-Type: form), on redirige
  if (!contentType.includes('application/json')) {
    // Redirige vers le referer UNIQUEMENT s'il est same-origin : sinon un
    // referer force par l'appelant deviendrait un open redirect.
    const referer = request.headers.get('referer');
    let safeReferer = '/';
    if (referer) {
      try {
        if (new URL(referer).origin === new URL(request.url).origin) safeReferer = referer;
      } catch {
        // referer non parseable -> fallback '/'
      }
    }
    return new Response(null, { status: 303, headers: { Location: safeReferer } });
  }

  return new Response(JSON.stringify({ ok: true, id: data.id, accepted_at: data.accepted_at }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
