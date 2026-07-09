// ============================================================================
// src/pages/api/formations/inscrire.ts
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/formations';
import { trainingRegistrationSchema, redemptionCodeSchema } from '@/lib/formations';
import type { AtomicTrainingRegisterResult, RedeemSponsorshipResult } from '@/types/formations';
import { enqueueEmail } from '@/lib/email-queue';
import { renderRegistrationConfirmation, type MailAddress } from '@/lib/mail';
import { formatDateLong, formatTimeRange, formatPriceCents, isFreeTraining } from '@/types/formations';
import { createHash } from 'node:crypto';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion?redirect=/formations');

  const form = await request.formData();
  const sessionId    = getFormString(form, 'session_id') ?? '';
  const amountRaw    = getFormString(form, 'amount_cents') ?? '0';
  const methodRaw    = getFormString(form, 'payment_method') ?? 'transfer';
  const notes        = getFormString(form, 'notes') ?? '';
  const codeRaw      = getFormString(form, 'redemption_code') ?? '';
  const cgvAccepted  = getFormString(form, 'cgv_accepted') === '1';

  // Verification que l\'utilisateur a accepte les CGV (case obligatoire)
  if (!cgvAccepted) {
    return redirect('/formations?error=' + encodeURIComponent('Vous devez accepter les CGV pour vous inscrire.'));
  }

  const parsed = trainingRegistrationSchema.safeParse({
    session_id:     sessionId,
    amount_cents:   amountRaw,
    payment_method: methodRaw,
    notes:          notes || undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect('/formations?error=' + encodeURIComponent(msg));
  }
  const data = parsed.data;

  // --- Cas special : redemption d\'un code de parrainage ---------------------
  if (data.payment_method === 'sponsorship') {
    const codeParsed = redemptionCodeSchema.safeParse(codeRaw);
    if (!codeParsed.success) {
      return redirect('/formations?error=' + encodeURIComponent('Code de parrainage invalide.'));
    }
    const { data: result, error: rpcError } = await supabase.rpc('redeem_sponsorship', {
      p_code: codeParsed.data,
      p_user_id: user.id,
      p_session_id: data.session_id,
    });
    if (rpcError) {
      console.error('[formations/inscrire] redeem_sponsorship error:', rpcError.message);
      return redirect('/formations?error=' + encodeURIComponent('Erreur lors de l\'utilisation du code.'));
    }
    const redeemResult = result as RedeemSponsorshipResult;
    if (redeemResult === 'OK') {
      await sendRegistrationEmail({
        userId:        user.id,
        userEmail:     user.email ?? '',
        userName:      user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
        sessionId:     data.session_id,
        paymentMethod: 'Parrainage (code utilise)',
        amountCents:   0,
      });
      return redirect('/dashboard/user/formations?saved=1&msg=' + encodeURIComponent('Place offerte par un parrain activee. A bientot !'));
    }
    switch (redeemResult) {
      case 'CODE_INVALID':
        return redirect('/formations?error=' + encodeURIComponent('Code de parrainage invalide ou deja utilise.'));
      case 'CODE_NOT_FOR_USER':
        return redirect('/formations?error=' + encodeURIComponent('Ce code est reserve a un autre email.'));
      case 'CODE_WRONG_SESSION':
        return redirect('/formations?error=' + encodeURIComponent('Ce code ne correspond pas a cette session.'));
      case 'ALREADY_REGISTERED':
        return redirect('/dashboard/user/formations?error=' + encodeURIComponent('Vous etes deja inscrit a cette session.'));
    }
  }

  // --- Inscription standard via RPC atomique --------------------------------
  const { data: result, error: rpcError } = await supabase.rpc('atomic_training_register', {
    p_session_id:     data.session_id,
    p_user_id:        user.id,
    p_amount_cents:   data.amount_cents,
    p_payment_method: data.payment_method,
  });

  if (rpcError) {
    console.error('[formations/inscrire] atomic_training_register error:', rpcError.message);
    return redirect('/formations?error=' + encodeURIComponent('Erreur lors de l\'inscription.'));
  }

  const regResult = result as AtomicTrainingRegisterResult;
  switch (regResult) {
    case 'SESSION_NOT_FOUND':
      return redirect('/formations?error=' + encodeURIComponent('Session introuvable.'));
    case 'SESSION_FULL':
      return redirect('/formations?error=' + encodeURIComponent('Session complete.'));
    case 'ALREADY_REGISTERED':
      return redirect('/dashboard/user/formations?error=' + encodeURIComponent('Vous etes deja inscrit.'));
    case 'NOT_ALLOWED':
      return redirect('/formations?error=' + encodeURIComponent('Action non autorisee.'));
  }

  // Enregistrer l\'acceptation des CGV (preuve juridique)
  try {
    const adminForAccept = createSupabaseAdminClient();
    const ip = request.headers.get('cf-connecting-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown';
    const ipHash = createHash('sha256').update(ip).digest('hex');
    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 256);
    await adminForAccept.from('legal_acceptance').insert({
      user_id: user.id,
      document_type: 'cgv',
      document_version: '1.0',
      context: 'payment',
      ip_hash: ipHash,
      user_agent: userAgent,
      email: user.email ?? null,
      accepted_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[formations/inscrire] legal_acceptance error:', err);
  }

  // OK -- envoyer l\'email de confirmation
  await sendRegistrationEmail({
    userId:        user.id,
    userEmail:     user.email ?? '',
    userName:      user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
    sessionId:     data.session_id,
    paymentMethod: data.payment_method,
    amountCents:   data.amount_cents,
  });

  const successMessage = (() => {
    switch (data.payment_method) {
      case 'transfer':
        return 'Inscription enregistree. Les instructions de virement vous ont ete envoyees par email.';
      case 'free_request':
        return 'Votre demande d\'exoneration a bien ete envoyee. Un admin vous repondra sous 48h.';
      default:
        return 'Inscription enregistree.';
    }
  })();

  return redirect('/dashboard/user/formations?saved=1&msg=' + encodeURIComponent(successMessage));
};

// ---------------------------------------------------------------------------
// Helper : envoie l\'email de confirmation apres inscription reussie
// ---------------------------------------------------------------------------

interface SendRegistrationEmailArgs {
  userId:        string;
  userEmail:     string;
  userName:      string;
  sessionId:     string;
  paymentMethod: string;
  amountCents:   number;
}

async function sendRegistrationEmail(args: SendRegistrationEmailArgs): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: session } = await admin
      .from('training_sessions_with_seats')
      .select('*')
      .eq('id', args.sessionId)
      .single();
    if (!session) return;

    const isFree = isFreeTraining(session.min_price_cents, session.suggested_price_cents, session.solidarity_price_cents);
    const amountLabel = formatPriceCents(args.amountCents);
    const methodLabels: Record<string, string> = {
      helloasso:     'HelloAsso (archive)',   // legacy : inscriptions anterieures au 2026-07-09
      transfer:      'Virement bancaire',
      sponsorship:   'Parrainage (place financee)',
      free_request:  'Demande d\'exoneration',
      free_approved: 'Place offerte',
    };
    const methodLabel = methodLabels[args.paymentMethod] ?? args.paymentMethod;

    let nextSteps = '';
    if (args.paymentMethod === 'transfer') {
      nextSteps = 'Effectuez le virement en utilisant les coordonnees bancaires ci-dessous, puis envoyez-nous le justificatif par retour d\'email pour accelerer la validation.';
    } else if (args.paymentMethod === 'free_request') {
      nextSteps = 'Votre demande va etre examinee par notre equipe. Vous recevrez un email de decision sous 48h ouvrables. Aucune action requise de votre part en attendant.';
    } else if (args.paymentMethod === 'sponsorship' || args.paymentMethod === 'free_approved') {
      nextSteps = 'Votre place est confirmee. A bientot !';
    } else {
      nextSteps = 'Votre inscription a bien ete prise en compte.';
    }

    const { html, text } = renderRegistrationConfirmation({
      userName:      args.userName,
      trainingTitle: session.training_title,
      sessionDate:   formatDateLong(session.starts_at),
      sessionTime:   formatTimeRange(session.starts_at, session.ends_at),
      location:      session.online ? 'En ligne' : (session.location ?? 'A definir'),
      amount:        isFree ? 'Gratuit' : amountLabel,
      paymentMethod: methodLabel,
      nextSteps,
      isFree:        isFree || args.paymentMethod === 'free_approved' || args.paymentMethod === 'sponsorship',
      bankInfo:      session.bank_transfer_info ?? undefined,
    });

    const fromAddress: MailAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };
    const replyTo = import.meta.env.SMTP_REPLY_TO
      ? { email: String(import.meta.env.SMTP_REPLY_TO) }
      : undefined;

    await enqueueEmail({
      from: fromAddress,
      to: { email: args.userEmail, name: args.userName },
      replyTo,
      subject: 'Inscription : ' + session.training_title,
      html,
      text,
      headers: { 'List-Unsubscribe': '<mailto:noreply@biscuits-ia.com>' },
    });
  } catch (err) {
    console.error('[formations/inscrire] sendRegistrationEmail error:', err);
  }
}