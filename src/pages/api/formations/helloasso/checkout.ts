// ============================================================================
// src/pages/api/formations/helloasso/checkout.ts
// ----------------------------------------------------------------------------
// Cree une intention de paiement HelloAsso pour une inscription existante.
// Redirige l'utilisateur vers HelloAsso pour payer.
// ============================================================================

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { uuidSchema } from '@/lib/formations';
import { createCheckoutIntent, HelloAssoError } from '@/lib/helloasso';
import { formatDateLong } from '@/types/formations';

const schema = z.object({
  registration_id: uuidSchema,
  amount_cents:    z.coerce.number().int().min(100, 'Montant minimum 1 EUR.').max(1_000_000),
});

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion?redirect=/formations');

  const form = await request.formData();
  const parsed = schema.safeParse({
    registration_id: form.get('registration_id'),
    amount_cents:    form.get('amount_cents'),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/formations?error=${encodeURIComponent(msg)}`);
  }

  const admin = createSupabaseAdminClient();

  const { data: reg, error: regErr } = await admin
    .from('training_registrations')
    .select('id, user_id, amount_cents, payment_method, status, session_id, training_sessions ( id, starts_at, ends_at, location, online, training_id )')
    .eq('id', parsed.data.registration_id)
    .single();

  if (regErr || !reg) {
    return redirect(`/formations?error=${encodeURIComponent('Inscription introuvable.')}`);
  }
  if (reg.user_id !== user.id) {
    return redirect(`/formations?error=${encodeURIComponent('Acces refuse.')}`);
  }
  if (reg.status === 'confirmed') {
    return redirect(`/dashboard/user/formations?msg=${encodeURIComponent('Deja paye, merci !')}`);
  }
  const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
  if (!session) {
    return redirect(`/formations?error=${encodeURIComponent('Session introuvable.')}`);
  }

  const { data: training } = await admin
    .from('trainings')
    .select('title')
    .eq('id', (session as { training_id: string }).training_id)
    .single();
  if (!training) {
    return redirect(`/formations?error=${encodeURIComponent('Formation introuvable.')}`);
  }

  const siteUrl = import.meta.env.SITE_URL || import.meta.env.PUBLIC_SITE_URL || 'https://biscuits-ia.com';
  try {
    const intent = await createCheckoutIntent({
      amountCents:    parsed.data.amount_cents,
      registrationId: reg.id,
      userEmail:      user.email ?? '',
      userName:       user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
      trainingTitle:  training.title,
      sessionDate:    formatDateLong(session.starts_at),
      successUrl:     `${siteUrl}/dashboard/user/formations?helloasso=success&reg=${reg.id}`,
      errorUrl:       `${siteUrl}/dashboard/user/formations?helloasso=error&reg=${reg.id}`,
      returnUrl:      `${siteUrl}/dashboard/user/formations?helloasso=return&reg=${reg.id}`,
    });

    await admin.from('training_payments').upsert({
      registration_id: reg.id,
      amount_cents:    parsed.data.amount_cents,
      provider:        'helloasso',
      provider_ref:    intent.intentId,
      status:          'pending',
    }, { onConflict: 'registration_id,provider' });

    return redirect(intent.redirectUrl, 303);
  } catch (err) {
    const msg = err instanceof HelloAssoError ? err.message : 'Erreur lors de la creation du paiement HelloAsso.';
    console.error('[formations/helloasso/checkout] error:', msg);
    return redirect(`/formations?error=${encodeURIComponent(msg)}`);
  }
};