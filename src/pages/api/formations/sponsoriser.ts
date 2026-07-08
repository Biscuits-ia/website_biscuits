// ============================================================================
// src/pages/api/formations/sponsoriser.ts
// ----------------------------------------------------------------------------
// Un particulier ou une entreprise peut parrainer une place :
//   - mode "pool"     : place mise a disposition du premier beneficiaire eligible
//   - mode "nominatif" : place reservee a un email precis
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/formations';
import { sponsorshipCreateSchema, generateUniqueRedemptionCode } from '@/lib/formations';
import { enqueueEmail } from '@/lib/email-queue';
import { renderSponsorshipConfirmation, type MailAddress } from '@/lib/mail';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  // Un parrain peut etre connecte ou non. Si connecte, on resoud son user_id.
  const { data: { user } } = await supabase.auth.getUser();

  const form = await request.formData();
  const trainingId      = getFormString(form, 'training_id') ?? '';
  const sessionId       = getFormString(form, 'session_id') ?? '';
  const mode            = getFormString(form, 'mode') ?? 'pool';
  const sponsorEmail    = getFormString(form, 'sponsor_email') ?? '';
  const sponsorName     = getFormString(form, 'sponsor_name') ?? '';
  const amountRaw       = getFormString(form, 'amount_cents') ?? '0';
  const message         = getFormString(form, 'message') ?? '';
  const beneficiaryEmail = getFormString(form, 'beneficiary_email') ?? '';
  const paymentMethod   = getFormString(form, 'payment_method') ?? 'helloasso';

  // Note : sponsorshipCreateSchema valide deja les UUIDs (uuidSchema sur
  // training_id et session_id) ; pas de pre-check isValidUUID necessaire.

  const parsed = sponsorshipCreateSchema.safeParse({
    training_id:      trainingId || undefined,
    session_id:       sessionId || undefined,
    mode:             mode,
    sponsor_email:    sponsorEmail,
    sponsor_name:     sponsorName,
    amount_cents:     amountRaw,
    message:          message || undefined,
    beneficiary_email: beneficiaryEmail || undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/formations/parrainer?error=${encodeURIComponent(msg)}`);
  }

  if (paymentMethod !== 'helloasso' && paymentMethod !== 'transfer') {
    return redirect(`/formations/parrainer?error=${encodeURIComponent('Mode de paiement invalide.')}`);
  }

  const admin = createSupabaseAdminClient();

  // Generation d'un code de redemption unique
  let redemptionCode: string;
  try {
    redemptionCode = await generateUniqueRedemptionCode(admin);
  } catch (err) {
    console.error('[formations/sponsoriser] code generation error:', err);
    return redirect(`/formations/parrainer?error=${encodeURIComponent('Erreur technique. Reessayez.')}`);
  }

  // Optionnel : recuperer le titre de la formation pour l'email
  let trainingTitle: string | undefined;
  if (parsed.data.training_id) {
    const { data: t } = await admin.from('trainings').select('title').eq('id', parsed.data.training_id).single();
    trainingTitle = t?.title;
  }

  const { data: sponsorship, error: insertErr } = await admin
    .from('training_sponsorships')
    .insert({
      sponsor_user_id:   user?.id ?? null,
      sponsor_email:     parsed.data.sponsor_email,
      sponsor_name:      parsed.data.sponsor_name,
      amount_cents:      parsed.data.amount_cents,
      message:           parsed.data.message ?? null,
      mode:              parsed.data.mode,
      beneficiary_email: parsed.data.beneficiary_email ?? null,
      target_training_id: parsed.data.training_id ?? null,
      target_session_id:  parsed.data.session_id ?? null,
      redemption_code:    redemptionCode,
      is_redeemed:        false,
      payment_status:     'pending',
      payment_provider:   paymentMethod,
      payment_ref:        null,
    })
    .select('id, redemption_code, amount_cents')
    .single();

  if (insertErr || !sponsorship) {
    console.error('[formations/sponsoriser] insert error:', insertErr?.message);
    return redirect(`/formations/parrainer?error=${encodeURIComponent('Erreur lors de l\'enregistrement du parrainage.')}`);
  }

  // Envoi de l'email de confirmation au parrain
  try {
    const { html, text } = renderSponsorshipConfirmation({
      sponsorName,
      amount: `${(parsed.data.amount_cents / 100).toFixed(2).replace('.', ',')} EUR`,
      mode: parsed.data.mode,
      beneficiaryEmail: parsed.data.beneficiary_email ?? undefined,
      trainingTitle,
      redemptionCode,
      adminLink: 'https://biscuits-ia.com/dashboard/admin/formations',
    });
    const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
    await enqueueEmail({
      from: fromAddress,
      to: { email: parsed.data.sponsor_email, name: parsed.data.sponsor_name },
      replyTo: import.meta.env.SMTP_REPLY_TO ? { email: String(import.meta.env.SMTP_REPLY_TO) } : undefined,
      subject: `Parrainage enregistre : ${redemptionCode}`,
      html,
      text,
    });
  } catch (err) {
    console.error('[formations/sponsoriser] email error:', err);
  }

  // Notification a l'admin (optionnel, pourrait etre desactive)
  try {
    const adminEmailsRaw = import.meta.env.ADMIN_NOTIFICATION_EMAILS ?? 'contact@biscuits-ia.com';
    const adminEmails = String(adminEmailsRaw).split(',').map((s) => s.trim()).filter(Boolean);
    if (adminEmails.length > 0) {
      const { renderAdminNotification } = await import('@/lib/mail');
      const { html, text } = renderAdminNotification({
        adminName:      'Admin',
        type:           'new_sponsorship',
        trainingTitle:  trainingTitle ?? '(formation non specifiee)',
        userName:       sponsorName,
        amount:         `${(parsed.data.amount_cents / 100).toFixed(2).replace('.', ',')} EUR`,
        details:        `Parrainage ${parsed.data.mode === 'pool' ? 'pool libre' : `nominatif (${parsed.data.beneficiary_email ?? ''})`}. Code : ${redemptionCode}.`,
        adminLink:      'https://biscuits-ia.com/dashboard/admin/formations',
      });
      const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
      for (const email of adminEmails) {
        await enqueueEmail({
          from: fromAddress,
          to: { email },
          subject: `Nouveau parrainage : ${trainingTitle ?? ''}`,
          html,
          text,
        });
      }
    }
  } catch (err) {
    console.error('[formations/sponsoriser] admin notification error:', err);
  }

  return redirect(`/formations/parrainer?saved=1&code=${encodeURIComponent(redemptionCode)}`);
};