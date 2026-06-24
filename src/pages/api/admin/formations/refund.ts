// ============================================================================
// src/pages/api/admin/formations/refund.ts
// ----------------------------------------------------------------------------
// Enregistre un remboursement effectue manuellement par un admin (apres
// qu'il ait fait le refund cote HelloAsso et nous ait fourni la preuve).
//
// Cote technique : on upsert dans helloasso_refunds et on met a jour les
// statuts derives. Le CA de la vue training_revenue_by_month est deduit
// automatiquement grace a la migration 20260624_email_queue_and_refunds.sql.
//
// Auth : admin uniquement.
// ============================================================================

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { uuidSchema } from '@/lib/formations';
import { enqueueEmail } from '@/lib/email-queue';
import { formatPriceCents } from '@/types/formations';

const schema = z.object({
  payment_id:      uuidSchema,
  amount_cents:    z.coerce.number().int().min(1, 'Montant invalide.'),
  reason:          z.string().trim().max(500).optional(),
});

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const parsed = schema.safeParse({
    payment_id:   getFormString(form, 'payment_id'),
    amount_cents: getFormString(form, 'amount_cents'),
    reason:       getFormString(form, 'reason') ?? undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent(msg)}`);
  }

  const admin = createSupabaseAdminClient();

  // 1. Recupere le paiement
  const { data: payment, error: payErr } = await admin
    .from('helloasso_payments')
    .select('id, intent_id, registration_id, amount_cents, refunded_amount_cents, currency, status')
    .eq('id', parsed.data.payment_id)
    .single();
  if (payErr || !payment) {
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent('Paiement introuvable.')}`);
  }

  // 2. Verifie que le refund ne depasse pas le reste a rembourser
  const remaining = payment.amount_cents - payment.refunded_amount_cents;
  if (parsed.data.amount_cents > remaining) {
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent(
      `Le remboursement (${parsed.data.amount_cents} centimes) depasse le reste a rembourser (${remaining} centimes).`,
    )}`);
  }

  // 3. Upsert dans helloasso_refunds (un seul refund par paiement)
  const isFull = parsed.data.amount_cents === payment.amount_cents;
  const refundType = isFull ? 'full' : 'partial';
  const { error: refundErr } = await admin
    .from('helloasso_refunds')
    .upsert({
      helloasso_payment_id: payment.id,
      amount_cents:         parsed.data.amount_cents,
      currency:             payment.currency,
      refund_type:          refundType,
      reason:               parsed.data.reason ?? null,
      raw_payload:          { source: 'admin', admin_id: user.id, reason: parsed.data.reason ?? null },
      source:               'admin',
      external_ref:         null,
      initiated_by:         user.id,
      refunded_at:          new Date().toISOString(),
    }, { onConflict: 'helloasso_payment_id' });

  if (refundErr) {
    console.error('[admin/formations/refund] error:', refundErr.message);
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors du remboursement.')}`);
  }

  // 4. Met a jour helloasso_payments
  await admin
    .from('helloasso_payments')
    .update({
      status:                  'refunded',
      refunded_amount_cents:   payment.refunded_amount_cents + parsed.data.amount_cents,
    })
    .eq('id', payment.id);

  // 5. Met a jour training_payments associe
  if (isFull) {
    await admin
      .from('training_payments')
      .update({ status: 'refunded' })
      .eq('registration_id', payment.registration_id)
      .eq('provider', 'helloasso');
    // Met a jour la registration
    await admin
      .from('training_registrations')
      .update({ status: 'cancelled' })
      .eq('id', payment.registration_id);
  }

  // 6. Email au user
  try {
    const { data: reg } = await admin
      .from('training_registrations')
      .select('user_id, training_sessions ( id, starts_at, training_id )')
      .eq('id', payment.registration_id)
      .single();
    if (reg) {
      const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
      if (session) {
        const { data: profile } = await admin
          .from('profiles')
          .select('email, full_name')
          .eq('id', reg.user_id)
          .single();
        const { data: training } = await admin
          .from('trainings')
          .select('title')
          .eq('id', (session as { training_id: string }).training_id)
          .single();
        if (profile?.email && training) {
          const amount = formatPriceCents(parsed.data.amount_cents);
          await enqueueEmail({
            from: { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' },
            to: { email: profile.email, name: profile.full_name ?? profile.email },
            subject: `Remboursement ${isFull ? 'total' : 'partiel'} : ${training.title}`,
            text: `Bonjour ${profile.full_name ?? profile.email}, un remboursement ${isFull ? 'total' : 'partiel'} de ${amount} a ete effectue pour la formation "${training.title}".`,
            html: `<p>Bonjour ${profile.full_name ?? ''},</p><p>Un remboursement ${isFull ? 'total' : 'partiel'} de <strong>${amount}</strong> a ete effectue pour la formation <strong>${training.title}</strong>.</p>`,
            metadata: { type: 'refund_admin', isFull: isFull ? '1' : '0' },
          });
        }
      }
    }
  } catch (err) {
    console.error('[admin/formations/refund] email error:', err);
  }

  return redirect('/dashboard/admin/formations?saved=1&msg=' + encodeURIComponent(
    isFull
      ? `Remboursement total de ${formatPriceCents(parsed.data.amount_cents)} enregistre.`
      : `Remboursement partiel de ${formatPriceCents(parsed.data.amount_cents)} enregistre.`
  ));
};