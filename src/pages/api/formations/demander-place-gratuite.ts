// ============================================================================
// src/pages/api/formations/demander-place-gratuite.ts
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/formations';
import { freeSeatRequestSchema } from '@/lib/formations';
import { enqueueEmail } from '@/lib/email-queue';
import { type MailAddress } from '@/lib/mail';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion?redirect=/formations');

  const form = await request.formData();
  const sessionId = getFormString(form, 'session_id') ?? '';
  const reason    = getFormString(form, 'reason') ?? '';

  const parsed = freeSeatRequestSchema.safeParse({
    session_id: sessionId,
    reason:     reason,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/formations?error=${encodeURIComponent(msg)}`);
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('training_free_seat_requests')
    .select('id, status')
    .eq('session_id', parsed.data.session_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return redirect(`/dashboard/user/formations?error=${encodeURIComponent('Vous avez deja une demande en cours pour cette session.')}`);
  }

  const { error: reqErr } = await admin
    .from('training_free_seat_requests')
    .insert({
      session_id: parsed.data.session_id,
      user_id:    user.id,
      reason:     parsed.data.reason,
      status:     'pending',
    });

  if (reqErr) {
    console.error('[formations/demander-place-gratuite] insert request error:', reqErr.message);
    return redirect(`/formations?error=${encodeURIComponent('Erreur lors de l\'envoi de la demande.')}`);
  }

  const { error: regErr } = await admin.rpc('atomic_training_register', {
    p_session_id:     parsed.data.session_id,
    p_user_id:        user.id,
    p_amount_cents:   0,
    p_payment_method: 'free_request',
  });

  if (regErr) {
    console.error('[formations/demander-place-gratuite] register error:', regErr.message);
  }

  // Email de confirmation immediate au demandeur
  try {
    const { data: session } = await admin
      .from('training_sessions_with_seats')
      .select('*')
      .eq('id', parsed.data.session_id)
      .single();
    if (session) {
      const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
      const { formatDateLong, formatTimeRange } = await import('@/types/formations');
      await enqueueEmail({
        from: fromAddress,
        to: { email: user.email ?? '', name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '' },
        subject: `Demande d'exoneration enregistree : ${session.training_title}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;line-height:1.5;max-width:600px;margin:24px auto;padding:24px;background:#fdfaf3;border:4px solid #2a2424">
          <h1 style="color:#5c3a1a">Demande bien recue</h1>
          <p>Bonjour ${user.user_metadata?.full_name ?? ''},</p>
          <p>Votre demande d'exoneration pour la formation <strong>${session.training_title}</strong> (${formatDateLong(session.starts_at)} - ${formatTimeRange(session.starts_at, session.ends_at)}) a bien ete enregistree.</p>
          <p>Notre equipe l'examinera sous 48h ouvrables. Vous recevrez un email avec la decision, sans engagement de votre part.</p>
          <p style="color:#8a5a2a;font-size:0.85rem;margin-top:32px">-- Biscuits IA - https://biscuits-ia.com</p>
        </body></html>`,
        text: `Demande d'exoneration enregistree pour ${session.training_title} (${formatDateLong(session.starts_at)}). Un admin vous repondra sous 48h ouvrables.`,
      });
    }
  } catch (err) {
    console.error('[formations/demander-place-gratuite] email error:', err);
  }

  // Notification a l'admin
  try {
    const adminEmailsRaw = import.meta.env.ADMIN_NOTIFICATION_EMAILS ?? 'contact@biscuits-ia.com';
    const adminEmails = String(adminEmailsRaw).split(',').map((s) => s.trim()).filter(Boolean);
    if (adminEmails.length > 0) {
      const { data: session } = await admin
        .from('training_sessions_with_seats')
        .select('*')
        .eq('id', parsed.data.session_id)
        .single();
      if (session) {
        const { renderAdminNotification } = await import('@/lib/mail');
        const { formatDateLong } = await import('@/types/formations');
        const { html, text } = renderAdminNotification({
          adminName:     'Admin',
          type:          'new_free_request',
          trainingTitle: session.training_title,
          sessionDate:   formatDateLong(session.starts_at),
          userName:      user.user_metadata?.full_name ?? user.email ?? '',
          details:       `Motivation : ${parsed.data.reason.slice(0, 200)}${parsed.data.reason.length > 200 ? '...' : ''}`,
          adminLink:     'https://biscuits-ia.com/dashboard/admin/formations',
        });
        const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
        for (const email of adminEmails) {
          await enqueueEmail({
            from: fromAddress,
            to: { email },
            subject: `Nouvelle demande d'exoneration : ${session.training_title}`,
            html,
            text,
          });
        }
      }
    }
  } catch (err) {
    console.error('[formations/demander-place-gratuite] admin notification error:', err);
  }

  return redirect(`/dashboard/user/formations?saved=1&msg=${encodeURIComponent('Votre demande a ete envoyee. Un admin la validera sous 48h.')}`);
};