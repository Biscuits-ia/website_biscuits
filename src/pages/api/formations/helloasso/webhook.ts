// ============================================================================
// src/pages/api/formations/helloasso/webhook.ts
// ----------------------------------------------------------------------------
// Endpoint IPN (webhook) HelloAsso. Recoit les notifications de paiement,
// verifie la signature HMAC, deduplique via payload_hash, met a jour le statut
// de l'inscription et envoie un email de confirmation.
// ============================================================================

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyWebhookSignature, payloadHash } from '@/lib/helloasso';
import { enqueueEmail } from '@/lib/email-queue';
import { type MailAddress } from '@/lib/mail';
import { formatDateLong, formatTimeRange, formatPriceCents } from '@/types/formations';
import { isValidUUID } from '@/lib/validation';

// ----------------------------------------------------------------------------
// Schemas Zod permissifs pour le payload IPN HelloAsso
// ----------------------------------------------------------------------------
// HelloAsso fait evoluer le format de ses webhooks entre versions (eventType
// vs event_type vs type, data.{amount,totalAmount} selon le type d'event).
// On garde donc un schema volontairement LACHE (.passthrough()) : les champs
// inconnus ne sont pas rejetes, on ne valide que les champs sensibles qui
// alimentent la compta / la BDD (montants, UUID, enum currency).
//
// Le payload est deja AUTHENTIFIE par la signature HMAC (etape 1) : il vient
// bien de HelloAsso. Le zod protege donc contre des donnees malformees qui
// corrompraient la base (registration_id non-UUID, montant negatif ou non
// numerique), pas contre un attaquant.
const helloAssoPayerSchema = z.object({
  email:     z.string().email().optional(),
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
}).optional();

const helloAssoDataSchema = z.object({
  checkoutIntentId: z.string().optional(),
  id:               z.string().optional(),
  amount:           z.number().int().nonnegative().optional(),
  totalAmount:      z.number().int().nonnegative().optional(),
  state:            z.string().optional(),
  status:           z.string().optional(),
  currency:         z.enum(['EUR', 'USD', 'GBP']).optional(),
  payer:            helloAssoPayerSchema,
  paidAt:           z.string().datetime().optional(),
  reason:           z.string().optional(),
  metadata:         z.object({ registration_id: z.string().uuid().optional() }).optional(),
}).optional();

const helloAssoWebhookSchema = z.object({
  eventType: z.string().optional(),
  event_type: z.string().optional(),
  type: z.string().optional(),
  checkoutIntentId: z.string().optional(),
  id: z.string().optional(),
  amount: z.number().int().nonnegative().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  currency: z.enum(['EUR', 'USD', 'GBP']).optional(),
  paidAt: z.string().datetime().optional(),
  reason: z.string().optional(),
  metadata: z.object({ registration_id: z.string().uuid().optional() }).optional(),
  data: helloAssoDataSchema,
}).passthrough();

type HelloAssoPayload = z.infer<typeof helloAssoWebhookSchema>;

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-helloasso-signature')
    ?? request.headers.get('X-HelloAsso-Signature')
    ?? request.headers.get('helloasso-signature');

  // 1. Verif signature HMAC
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[helloasso/webhook] signature invalide');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  // 2. Parse le body avec validation zod permissive
  // Le .passthrough() garde les champs inconnus dans payload, on peut donc
  // acceder a payload.data?.amount (meme si pas declare) sans crash.
  const parseResult = helloAssoWebhookSchema.safeParse((() => {
    try { return JSON.parse(rawBody); }
    catch { return null; }
  })());
  if (!parseResult.success) {
    console.warn('[helloasso/webhook] zod validation failed:', parseResult.error.issues[0]?.message);
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
  }
  const payload: HelloAssoPayload = parseResult.data;

  // 3. Deduplication via hash
  const hash = payloadHash(rawBody);
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('helloasso_payments')
    .select('id')
    .eq('payload_hash', hash)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, deduplicated: true }), { status: 200 });
  }

  // 4. Extraire les infos cles
  const eventType: string = payload?.eventType ?? payload?.event_type ?? payload?.type ?? 'unknown';
  const intentId:   string = payload?.data?.checkoutIntentId
                          ?? payload?.checkoutIntentId
                          ?? payload?.data?.id
                          ?? payload?.id
                          ?? '';
  const amountCentsRaw: number = payload?.data?.amount
                              ?? payload?.amount
                              ?? payload?.data?.totalAmount
                              ?? 0;
  // Le montant alimente la comptabilite (helloasso_payments, training_payments)
  // et les emails. On refuse tout ce qui n'est pas un entier de centimes >= 0.
  const amountCents = Number.isInteger(amountCentsRaw) && amountCentsRaw >= 0 ? amountCentsRaw : 0;
  const status: string = payload?.data?.state
                       ?? payload?.state
                       ?? payload?.data?.status
                       ?? 'pending';
  const payerEmail: string | null = payload?.data?.payer?.email ?? null;
  const payerName:  string | null = payload?.data?.payer?.firstName
                    ? `${payload.data.payer.firstName} ${payload.data.payer.lastName ?? ''}`.trim()
                    : null;
  const paidAt: string | null = payload?.data?.paidAt ?? payload?.paidAt ?? null;
  const registrationId: string = payload?.data?.metadata?.registration_id
                               ?? payload?.metadata?.registration_id
                               ?? '';

  if (!registrationId) {
    console.warn('[helloasso/webhook] pas de registration_id dans le payload');
    return new Response(JSON.stringify({ error: 'Missing registration_id' }), { status: 400 });
  }
  // registration_id sert de clef sur training_registrations : un format invalide
  // ne doit jamais atteindre la base. zod a deja valide le format UUID en etape 2
  // (metadata.registration_id: z.string().uuid().optional()) ; on garde un
  // garde-fou explicite au cas ou le payload evolue hors schema.
  if (!isValidUUID(registrationId)) {
    console.warn('[helloasso/webhook] registration_id non-UUID:', registrationId);
    return new Response(JSON.stringify({ error: 'Invalid registration_id' }), { status: 400 });
  }

  // 5. Mapper le statut HelloAsso vers notre enum
  const mappedStatus = mapHelloAssoStatus(status);

  // 6. Inserer la trace paiement (idempotente via payload_hash UNIQUE)
  const { error: insertErr } = await admin.from('helloasso_payments').insert({
    intent_id:       intentId || `evt-${Date.now()}`,
    registration_id: registrationId,
    amount_cents:    amountCents,
    currency:        (() => {
      const raw = payload?.data?.currency ?? payload?.currency;
      return raw === "EUR" || raw === "USD" || raw === "GBP" ? raw : "EUR";
    })(),
    status:          mappedStatus,
    paid_at:         paidAt,
    payer_email:     payerEmail,
    payer_name:      payerName,
    raw_payload:     payload,
    payload_hash:    hash,
    ipn_event_type:  eventType,
  });
  if (insertErr) {
    console.error('[helloasso/webhook] insert error:', insertErr.message);
    return new Response(JSON.stringify({ error: 'insert failed' }), { status: 500 });
  }

  // 7. Si paiement confirme, mettre a jour l'inscription et le paiement dans training_payments
  if (mappedStatus === 'confirmed' || mappedStatus === 'authorized') {
    await admin.from('training_registrations').update({
      status:         'confirmed',
      payment_method: 'helloasso',
    }).eq('id', registrationId);

    // Upsert dans training_payments (notre table de suivi comptable)
    await admin.from('training_payments').upsert({
      registration_id: registrationId,
      amount_cents:    amountCents,
      provider:        'helloasso',
      provider_ref:    intentId,
      status:          'received',
      received_at:     paidAt ?? new Date().toISOString(),
      note:            `Auto-validated via IPN (event=${eventType})`,
    }, { onConflict: 'registration_id,provider' });

    // 8. Email de confirmation au user
    try {
      await sendConfirmationEmail(registrationId, admin);
    } catch (err) {
      console.error('[helloasso/webhook] confirmation email error:', err);
    }
  } else if (mappedStatus === 'refused' || mappedStatus === 'cancelled') {
    await admin.from('training_registrations').update({
      status:         'pending_payment',
      payment_method: 'helloasso',
    }).eq('id', registrationId);
  }


  // 9. Gestion des remboursements (evenement payment.refunded)
  // Detecte les events de refund et les enregistre dans helloasso_refunds.
  if (eventType === 'payment.refunded' || eventType === 'Payment.Refunded' || status.toLowerCase() === 'refunded') {
    // Trouve le helloasso_payments lie a cet intent_id
    const { data: existingPayment } = await admin
      .from('helloasso_payments')
      .select('id, registration_id, amount_cents')
      .eq('intent_id', intentId)
      .maybeSingle();

    if (existingPayment) {
      const refundAmount = amountCents > 0 ? amountCents : existingPayment.amount_cents;
      const isFull = refundAmount >= existingPayment.amount_cents;
      const refundType = isFull ? 'full' : 'partial';

      // Upsert dans helloasso_refunds (un seul refund par paiement cote DB)
      const { error: refundErr } = await admin
        .from('helloasso_refunds')
        .upsert({
          helloasso_payment_id: existingPayment.id,
          amount_cents:         refundAmount,
          currency:             (() => {
            const raw = payload?.data?.currency ?? payload?.currency;
            return raw === "EUR" || raw === "USD" || raw === "GBP" ? raw : "EUR";
          })(),
          refund_type:          refundType,
          reason:               payload?.data?.reason ?? payload?.reason ?? null,
          raw_payload:          payload,
          source:               'webhook',
          external_ref:         payload?.data?.id ?? null,
          refunded_at:          paidAt ?? new Date().toISOString(),
        }, { onConflict: 'helloasso_payment_id' });

      if (!refundErr) {
        // Met a jour helloasso_payments.refunded_amount_cents
        await admin
          .from('helloasso_payments')
          .update({
            status: 'refunded',
            refunded_amount_cents: refundAmount,
          })
          .eq('id', existingPayment.id);

        // Met a jour training_payments associe
        await admin
          .from('training_payments')
          .update({ status: 'refunded' })
          .eq('registration_id', existingPayment.registration_id)
          .eq('provider', 'helloasso');

        // Met a jour la registration
        if (isFull) {
          await admin
            .from('training_registrations')
            .update({ status: 'cancelled' })
            .eq('id', existingPayment.registration_id);
        }

        // Email au user : remboursement
        try {
          await sendRefundEmailToUser(existingPayment.registration_id, refundAmount, isFull, admin);
        } catch (err) {
          console.error('[helloasso/webhook] refund email error:', err);
        }

        // Notification admin
        try {
          await sendRefundEmailToAdmin(existingPayment.registration_id, refundAmount, isFull, admin);
        } catch (err) {
          console.error('[helloasso/webhook] refund admin email error:', err);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function mapHelloAssoStatus(raw: string): 'pending' | 'authorized' | 'confirmed' | 'refused' | 'cancelled' | 'refunded' {
  const s = (raw ?? '').toLowerCase();
  if (s === 'confirmed' || s === 'paid' || s === 'succeeded') return 'confirmed';
  if (s === 'authorized' || s === 'pending') return 'authorized';
  if (s === 'refused' || s === 'failed' || s === 'error') return 'refused';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'refunded') return 'refunded';
  return 'pending';
}

async function sendConfirmationEmail(registrationId: string, admin: ReturnType<typeof createSupabaseAdminClient>): Promise<void> {
  const { data: reg } = await admin
    .from('training_registrations')
    .select('user_id, amount_cents, session_id, training_sessions ( id, starts_at, ends_at, location, online, training_id )')
    .eq('id', registrationId)
    .single();
  if (!reg) return;
  const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
  if (!session) return;

  const [{ data: profile }, { data: training }] = await Promise.all([
    admin.from('profiles').select('email, full_name').eq('id', reg.user_id).single(),
    admin.from('trainings').select('title').eq('id', (session as { training_id: string }).training_id).single(),
  ]);
  if (!profile?.email || !training) return;

  const { renderRegistrationConfirmation } = await import('@/lib/mail');
  const { html, text } = renderRegistrationConfirmation({
    userName:      profile.full_name ?? profile.email,
    trainingTitle: training.title,
    sessionDate:   formatDateLong(session.starts_at),
    sessionTime:   formatTimeRange(session.starts_at, session.ends_at),
    location:      session.online ? 'En ligne' : (session.location ?? 'A definir'),
    amount:        formatPriceCents(reg.amount_cents),
    paymentMethod: 'HelloAsso (paiement valide)',
    nextSteps:     'Votre paiement a ete recu et valide automatiquement. Votre place est definitivement confirmee. A bientot !',
    isFree:        reg.amount_cents === 0,
  });

  const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
  await enqueueEmail({
    from: fromAddress,
    to: { email: profile.email, name: profile.full_name ?? profile.email },
    subject: `Inscription confirmee : ${training.title}`,
    html,
    text,
  });
}
// ---------------------------------------------------------------------------
// Helper : email au user apres refund
// ---------------------------------------------------------------------------

async function sendRefundEmailToUser(
  registrationId: string,
  refundCents: number,
  isFull: boolean,
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<void> {
  const { data: reg } = await admin
    .from('training_registrations')
    .select('user_id, training_sessions ( id, starts_at, training_id )')
    .eq('id', registrationId)
    .single();
  if (!reg) return;
  const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
  if (!session) return;

  const [{ data: profile }, { data: training }] = await Promise.all([
    admin.from('profiles').select('email, full_name').eq('id', reg.user_id).single(),
    admin.from('trainings').select('title').eq('id', (session as { training_id: string }).training_id).single(),
  ]);
  if (!profile?.email || !training) return;

  const amount = (refundCents / 100).toFixed(2).replace('.', ',') + ' EUR';
  const subject = isFull
    ? `Remboursement effectue : ${training.title}`
    : `Remboursement partiel : ${training.title}`;
  const text = `Bonjour ${profile.full_name ?? profile.email},

Nous avons effectue un remboursement ${isFull ? 'total' : 'partiel'} de ${amount} pour votre inscription a la formation "${training.title}".

${isFull ? 'Votre place a ete liberee et votre inscription annulee.' : 'Votre place reste reservee pour la session.'}

Le remboursement sera visible sur votre compte bancaire sous 5 a 10 jours ouvrables selon votre etablissement.

--
Biscuits IA - https://biscuits-ia.com`;

  await enqueueEmail({
    from: { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' },
    to: { email: profile.email, name: profile.full_name ?? profile.email },
    subject,
    text,
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fdfaf3;border:4px solid #2a2424">
      <h1 style="color:#5c3a1a">Remboursement ${isFull ? 'total' : 'partiel'}</h1>
      <p>Bonjour ${profile.full_name ?? ''},</p>
      <p>Nous avons effectue un remboursement ${isFull ? 'total' : 'partiel'} de <strong>${amount}</strong> pour votre inscription a la formation <strong>${training.title}</strong>.</p>
      ${isFull ? '<p>Votre place a ete liberee et votre inscription annulee.</p>' : '<p>Votre place reste reservee pour la session.</p>'}
      <p style="color:#8a5a2a;font-size:0.85rem">Le remboursement sera visible sur votre compte bancaire sous 5 a 10 jours ouvrables.</p>
      <p style="color:#8a5a2a;font-size:0.85rem;margin-top:32px">-- Biscuits IA - https://biscuits-ia.com</p>
    </body></html>`,
    metadata: { type: 'refund', isFull: isFull ? '1' : '0', registration_id: registrationId },
  });
}

async function sendRefundEmailToAdmin(
  registrationId: string,
  refundCents: number,
  isFull: boolean,
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<void> {
  const adminEmailsRaw = import.meta.env.ADMIN_NOTIFICATION_EMAILS ?? 'contact@biscuits-ia.com';
  const adminEmails = String(adminEmailsRaw).split(',').map((s) => s.trim()).filter(Boolean);
  if (adminEmails.length === 0) return;

  const { data: reg } = await admin
    .from('training_registrations')
    .select('user_id, training_sessions ( id, starts_at, training_id )')
    .eq('id', registrationId)
    .single();
  if (!reg) return;
  const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
  if (!session) return;

  const [{ data: profile }, { data: training }] = await Promise.all([
    admin.from('profiles').select('email, full_name').eq('id', reg.user_id).single(),
    admin.from('trainings').select('title').eq('id', (session as { training_id: string }).training_id).single(),
  ]);
  if (!training) return;

  const amount = (refundCents / 100).toFixed(2).replace('.', ',') + ' EUR';
  const subject = `Remboursement ${isFull ? 'total' : 'partiel'} : ${training.title}`;

  for (const email of adminEmails) {
    await enqueueEmail({
      from: { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' },
      to: { email },
      subject,
      text: `Remboursement ${isFull ? 'total' : 'partiel'} de ${amount} pour l'inscription ${registrationId} (${training.title}). User: ${profile?.email ?? '?'}.`,
      html: `<p>Remboursement ${isFull ? 'total' : 'partiel'} de <strong>${amount}</strong> pour la formation <strong>${training.title}</strong>. User: ${profile?.email ?? '?'}.</p><p><a href="https://biscuits-ia.com/dashboard/admin/formations">Voir le dashboard</a></p>`,
      metadata: { type: 'refund_admin', isFull: isFull ? '1' : '0', registration_id: registrationId },
    });
  }
}