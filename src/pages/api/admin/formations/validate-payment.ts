// ============================================================================
// src/pages/api/admin/formations/validate-payment.ts
// ----------------------------------------------------------------------------
// Valide un paiement manuellement (virement recu, exoneration approuvee/refusee).
// Envoie les emails appropries (user + admin).
// ============================================================================

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { uuidSchema } from '@/lib/formations';
import { enqueueEmail } from '@/lib/email-queue';
import { renderFreeRequestDecision, type MailAddress } from '@/lib/mail';
import { formatDateLong, formatTimeRange, formatPriceCents } from '@/types/formations';

const schema = z.object({
  payment_id:      uuidSchema.optional(),
  registration_id: uuidSchema.optional(),
  sponsorship_id:  uuidSchema.optional(),
  free_request_id: uuidSchema.optional(),
  // FIX P1 2.2 : on remplace la convention fragile `note !== 'REFUSE'` par un
  // champ dedie `decision` (enum). Le `note` reste libre pour le motif texte.
  decision: z.enum(['APPROVE', 'REFUSE']).default('APPROVE'),
  note:     z.string().trim().max(500).optional(),
}).refine(
  (data) => !!data.payment_id || !!data.registration_id || !!data.sponsorship_id || !!data.free_request_id,
  { message: 'Aucun identifiant fourni.' },
);

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const parsed = schema.safeParse({
    payment_id:      getFormString(form, 'payment_id') ?? undefined,
    registration_id: getFormString(form, 'registration_id') ?? undefined,
    sponsorship_id:  getFormString(form, 'sponsorship_id') ?? undefined,
    free_request_id: getFormString(form, 'free_request_id') ?? undefined,
    decision:        getFormString(form, 'decision') ?? 'APPROVE',
    note:            getFormString(form, 'note') ?? undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent(msg)}`);
  }

  const admin = createSupabaseAdminClient();
  const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };

  // --- Cas 1 : valider un paiement deja cree ---------------------------------
  if (parsed.data.payment_id) {
    const { error } = await admin
      .from('training_payments')
      .update({
        status:      'received',
        received_at: new Date().toISOString(),
        note:        parsed.data.note ?? null,
      })
      .eq('id', parsed.data.payment_id);
    if (error) {
      console.error('[admin/formations/validate-payment] update payment error:', error.message);
      return redirect(`/dashboard/admin/formations?error=${encodeURIComponent('Erreur validation paiement.')}`);
    }
    // Met l'inscription en "confirmed"
    const { data: payment } = await admin
      .from('training_payments')
      .select('registration_id')
      .eq('id', parsed.data.payment_id)
      .single();
    if (payment) {
      await admin.from('training_registrations').update({ status: 'confirmed' }).eq('id', payment.registration_id);
      // Email de confirmation au user
      await sendPaymentConfirmationEmail(payment.registration_id, admin, fromAddress);
    }
  }

  // --- Cas 2 : valider un parrainage (passe en "received", place utilisable)
  if (parsed.data.sponsorship_id) {
    const { data: sponsorship, error } = await admin
      .from('training_sponsorships')
      .update({
        payment_status: 'received',
        updated_at:     new Date().toISOString(),
      })
      .eq('id', parsed.data.sponsorship_id)
      .select('id, sponsor_name, sponsor_email, amount_cents, training_id, redemption_code, target_training_id')
      .single();
    if (error) {
      console.error('[admin/formations/validate-payment] update sponsorship error:', error.message);
      return redirect(`/dashboard/admin/formations?error=${encodeURIComponent('Erreur validation parrainage.')}`);
    }
    if (sponsorship) {
      // Email au parrain : paiement recu
      try {
        const { renderSponsorshipConfirmation } = await import('@/lib/mail');
        let trainingTitle: string | undefined;
        if (sponsorship.target_training_id) {
          const { data: t } = await admin.from('trainings').select('title').eq('id', sponsorship.target_training_id).single();
          trainingTitle = t?.title;
        }
        const { html, text } = renderSponsorshipConfirmation({
          sponsorName:     sponsorship.sponsor_name,
          amount:          formatPriceCents(sponsorship.amount_cents),
          mode:            'pool',
          trainingTitle,
          redemptionCode:  sponsorship.redemption_code ?? '',
          adminLink:       'https://biscuits-ia.com',
        });
        await enqueueEmail({
          from: fromAddress,
          to: { email: sponsorship.sponsor_email, name: sponsorship.sponsor_name },
          subject: 'Parrainage valide - votre code est actif',
          html,
          text,
        });
      } catch (err) {
        console.error('[admin/formations/validate-payment] sponsor email error:', err);
      }
    }
  }

  // --- Cas 3 : approuver ou refuser une demande d'exoneration ---------------
  if (parsed.data.free_request_id) {
    // FIX P1 2.2 : on utilise maintenant le champ `decision` dedie.
    const isApproved = parsed.data.decision === 'APPROVE';

    // Idempotence : on verifie qu'une decision n'a pas deja ete prise.
    const { data: existing } = await admin
      .from('training_free_seat_requests')
      .select('id, status')
      .eq('id', parsed.data.free_request_id)
      .maybeSingle();
    if (!existing) {
      return redirect('/dashboard/admin/formations?error=' + encodeURIComponent('Demande introuvable.'));
    }
    if (existing.status !== 'pending') {
      return redirect('/dashboard/admin/formations?error=' + encodeURIComponent('Cette demande a deja ete traitee.'));
    }

    const { data: req } = await admin
      .from('training_free_seat_requests')
      .select('id, user_id, session_id, reason')
      .eq('id', parsed.data.free_request_id)
      .single();
    if (req) {
      await admin
        .from('training_free_seat_requests')
        .update({
          status:      isApproved ? 'approved' : 'refused',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          admin_note:  parsed.data.note ?? null,
        })
        .eq('id', parsed.data.free_request_id);

      if (isApproved) {
        await admin
          .from('training_registrations')
          .update({
            status:         'confirmed',
            payment_method: 'free_approved',
          })
          .eq('session_id', req.session_id)
          .eq('user_id',    req.user_id)
          .neq('status', 'cancelled');
      }

      // Email au demandeur
      try {
        const { data: userRow } = await admin
          .from('profiles')
          .select('email, full_name')
          .eq('id', req.user_id)
          .single();
        if (userRow?.email) {
          const { data: session } = await admin
            .from('training_sessions_with_seats')
            .select('*')
            .eq('id', req.session_id)
            .single();
          if (session) {
            const { html, text } = renderFreeRequestDecision({
              userName:      userRow.full_name ?? userRow.email,
              trainingTitle: session.training_title,
              sessionDate:   formatDateLong(session.starts_at),
              reason:        req.reason,
              status:        isApproved ? 'approved' : 'refused',
              adminNote:     parsed.data.note,
            });
            await enqueueEmail({
              from: fromAddress,
              to: { email: userRow.email, name: userRow.full_name ?? userRow.email },
              subject: `Demande d'exoneration : ${isApproved ? 'approuvee' : 'refusee'}`,
              html,
              text,
            });
          }
        }
      } catch (err) {
        console.error('[admin/formations/validate-payment] free request email error:', err);
      }
    }
  }

  // --- Cas 4 : valider une inscription (markup rapide en "confirmed") -------
  if (parsed.data.registration_id) {
    await admin
      .from('training_registrations')
      .update({ status: 'confirmed' })
      .eq('id', parsed.data.registration_id);
    await sendPaymentConfirmationEmail(parsed.data.registration_id, admin, fromAddress);
  }

  const successMessage = parsed.data.free_request_id
    ? (parsed.data.decision === 'APPROVE' ? 'Demande d exoneration approuvee.' : 'Demande d exoneration refusee.')
    : 'Paiement valide.';

  return redirect(`/dashboard/admin/formations?saved=1&msg=${encodeURIComponent(successMessage)}`);
};

// ---------------------------------------------------------------------------
// Helper : envoie un email de confirmation au user apres paiement recu
// ---------------------------------------------------------------------------

async function sendPaymentConfirmationEmail(
  registrationId: string,
  admin: ReturnType<typeof createSupabaseAdminClient>,
  fromAddress: MailAddress,
): Promise<void> {
  try {
    const { data: reg } = await admin
      .from('training_registrations')
      .select('user_id, amount_cents, payment_method, session_id, training_sessions ( id, starts_at, ends_at, location, online, training_id )')
      .eq('id', registrationId)
      .single();
    if (!reg) return;
    const session = Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions;
    if (!session) return;

    const { data: profile } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', reg.user_id)
      .single();
    if (!profile?.email) return;

    const { data: training } = await admin
      .from('trainings')
      .select('title')
      .eq('id', (session as { training_id: string }).training_id)
      .single();
    if (!training) return;

    const { renderRegistrationConfirmation } = await import('@/lib/mail');
    const { html, text } = renderRegistrationConfirmation({
      userName:      profile.full_name ?? profile.email,
      trainingTitle: training.title,
      sessionDate:   formatDateLong(session.starts_at),
      sessionTime:   formatTimeRange(session.starts_at, session.ends_at),
      location:      session.online ? 'En ligne' : (session.location ?? 'A definir'),
      amount:        formatPriceCents(reg.amount_cents),
      paymentMethod: 'Paiement valide',
      nextSteps:     'Votre paiement a ete valide. Votre place est definitivement confirmee. A bientot !',
      isFree:        reg.amount_cents === 0,
    });
    await enqueueEmail({
      from: fromAddress,
      to: { email: profile.email, name: profile.full_name ?? profile.email },
      subject: `Inscription confirmee : ${training.title}`,
      html,
      text,
    });
  } catch (err) {
    console.error('[admin/formations/validate-payment] sendPaymentConfirmationEmail error:', err);
  }
}
