// ============================================================================
// src/lib/email-queue.ts
// ----------------------------------------------------------------------------
// File d'attente d'emails avec retry exponentiel.
//
// Le probleme : SMTP est un service externe qui peut etre temporairement
// indisponible (OVH down, timeout, etc). Si on envoie l'email en best-effort
// depuis une requete utilisateur, on perd l'email quand l'envoi echoue.
//
// La solution : on enqueue systematiquement, et un worker (cron) envoie par
// batch. Si l'envoi echoue, on retente avec un backoff exponentiel :
//   1min -> 5min -> 25min -> 2h -> 10h -> 2j -> 5j -> 10j
// Apres 8 tentatives (10j), on passe l'email en 'dead' et on previent l'admin.
//
// Cote API : sendMail() ne leve jamais, et insere dans la queue. Le worker
// fait le vrai travail SMTP. Pas d'attente cote user.
// ============================================================================

import { createSupabaseAdminClient } from './supabase';
import { sendMail as sendMailDirect } from './mail';
import type { MailMessage, MailSendResult } from './mail';

// --------------------------------------------------------------------------
// Constantes
// --------------------------------------------------------------------------

/** Delai minimum entre 2 tentatives (en secondes). */

/** Nombre maximum de tentatives avant de marquer l'email comme 'dead'. */
const MAX_ATTEMPTS_DEFAULT = 8;

/**
 * Backoff en secondes : index 0 = 1ere retry, etc.
 * 1min, 5min, 25min, 2h05, 10h25, ~2j, ~5j, ~10j
 */
const BACKOFF_SECONDS = [
  60,             // 1 min
  300,            // 5 min
  1_500,          // 25 min
  7_500,          // 2h05
  36_900,         // 10h15
  172_800,        // 2 jours
  432_000,        // 5 jours
  864_000,        // 10 jours
];

/** Taille max d'un batch traite par le worker. */
const BATCH_SIZE = 25;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface EnqueueOptions {
  /** Nombre maximum de tentatives (defaut 8). */
  maxAttempts?: number;
  /** Metadata pour le debug (type d'email, contexte, etc). */
  metadata?:    Record<string, string | number | boolean | null>;
}

export interface EnqueueResult {
  id:     string;     // UUID dans email_outbox
  status: 'pending';
}

export interface WorkerResult {
  processed:  number;
  succeeded:  number;
  failed:     number;
  retried:    number;
  dead:       number;
  errors:     Array<{ id: string; error: string }>;
}

// --------------------------------------------------------------------------
// Enqueue : insere un email dans la queue
// --------------------------------------------------------------------------

/**
 * Insere un email dans la file. Cote API, on appelle TOUJOURS cette fonction,
 * jamais sendMail() directement. Le worker cron envoie reellement plus tard.
 *
 * @returns L'id de l'email dans la queue.
 */
export async function enqueueEmail(msg: MailMessage, opts: EnqueueOptions = {}): Promise<EnqueueResult> {
  const admin = createSupabaseAdminClient();

  const toEmail = Array.isArray(msg.to) ? msg.to[0]?.email ?? '' : msg.to.email;
  const toName  = Array.isArray(msg.to) ? msg.to[0]?.name  ?? null : msg.to.name ?? null;

  if (!toEmail) {
    throw new Error('[email-queue] enqueueEmail: pas de destinataire (to.email manquant).');
  }

  const { data, error } = await admin
    .from('email_outbox')
    .insert({
      to_email:       toEmail,
      to_name:        toName,
      from_email:     msg.from.email,
      from_name:      msg.from.name ?? null,
      reply_to_email: msg.replyTo
        ? (Array.isArray(msg.replyTo) ? msg.replyTo[0]?.email ?? null : msg.replyTo.email ?? null)
        : null,
      subject:        msg.subject,
      text_body:      msg.text ?? null,
      html_body:      msg.html ?? null,
      headers:        msg.headers ?? {},
      status:         'pending',
      attempts:       0,
      max_attempts:   opts.maxAttempts ?? MAX_ATTEMPTS_DEFAULT,
      next_attempt_at: new Date().toISOString(),
      metadata:       opts.metadata ?? {},
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[email-queue] enqueue error:', error?.message);
    throw new Error(`[email-queue] enqueue failed: ${error?.message ?? 'unknown'}`);
  }
  return { id: data.id, status: 'pending' };
}

// --------------------------------------------------------------------------
// Worker : traite un batch d'emails en attente
// --------------------------------------------------------------------------

/**
 * Recupere jusqu'a BATCH_SIZE emails a envoyer, tente de les envoyer,
 * met a jour le statut. Appelee par le cron toutes les 1-2 minutes.
 *
 * @param maxProcess nombre max d'emails a traiter dans cet appel
 *                  (utile pour les tests ; en prod, mettre BATCH_SIZE)
 */
export async function processEmailOutbox(maxProcess: number = BATCH_SIZE): Promise<WorkerResult> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // 1. Selectionner les emails a traiter (ceux dont next_attempt_at <= now)
  const { data: pending, error: fetchErr } = await admin
    .from('email_outbox')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(maxProcess);

  if (fetchErr) {
    console.error('[email-queue] fetch error:', fetchErr.message);
    return { processed: 0, succeeded: 0, failed: 0, retried: 0, dead: 0, errors: [{ id: '?', error: fetchErr.message }] };
  }

  const result: WorkerResult = {
    processed: 0, succeeded: 0, failed: 0, retried: 0, dead: 0, errors: [],
  };

  for (const row of pending ?? []) {
    result.processed += 1;

    // 2. Marquer 'sending' atomiquement (evite qu'un autre worker reprenne le meme)
    const { error: lockErr } = await admin
      .from('email_outbox')
      .update({ status: 'sending', last_attempt_at: now })
      .eq('id', row.id)
      .in('status', ['pending', 'failed']);
    if (lockErr) {
      // Un autre worker l'a pris, on skip
      continue;
    }

    // 3. Tenter l'envoi
    const mailMessage: MailMessage = {
      from:     { email: row.from_email, name: row.from_name ?? undefined },
      to:       { email: row.to_email,   name: row.to_name ?? undefined },
      replyTo:  row.reply_to_email ? { email: row.reply_to_email } : undefined,
      subject:  row.subject,
      text:     row.text_body ?? undefined,
      html:     row.html_body ?? undefined,
      headers:  (row.headers as Record<string, string>) ?? {},
    };

    let sendResult: MailSendResult;
    try {
      sendResult = await sendMailDirect(mailMessage);
    } catch (err) {
      sendResult = {
        messageId: '',
        accepted:  [],
        rejected:  [row.to_email],
        response:  err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Mettre a jour le statut en fonction du resultat
    const attempts = row.attempts + 1;
    if (sendResult.accepted.length > 0) {
      // Succes
      await admin
        .from('email_outbox')
        .update({
          status:        'sent',
          sent_at:       new Date().toISOString(),
          attempts:      attempts,
          last_error:    null,
          message_id:    sendResult.messageId,
        })
        .eq('id', row.id);
      result.succeeded += 1;
    } else {
      // Echec : retry ou dead
      const isDead = attempts >= row.max_attempts;
      const nextDelay = isDead ? null : BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
      const nextAt = nextDelay ? new Date(Date.now() + nextDelay * 1000).toISOString() : null;

      await admin
        .from('email_outbox')
        .update({
          status:          isDead ? 'dead' : 'failed',
          attempts:        attempts,
          last_error:      sendResult.response.slice(0, 1000),
          next_attempt_at: nextAt ?? new Date().toISOString(),
        })
        .eq('id', row.id);

      result.failed += 1;
      if (isDead) {
        result.dead += 1;
      } else {
        result.retried += 1;
      }
      result.errors.push({ id: row.id, error: sendResult.response });

      // Si l'email est 'dead', on previent l'admin par mail (best-effort)
      if (isDead) {
        await notifyAdminOfDeadEmail(row, attempts, sendResult.response);
      }
    }
  }

  return result;
}

// --------------------------------------------------------------------------
// Helper : notification admin d'un email en 'dead'
// --------------------------------------------------------------------------

async function notifyAdminOfDeadEmail(row: { id: string; to_email: string; subject: string; last_error: string | null }, attempts: number, lastResponse: string): Promise<void> {
  try {
    const adminEmailsRaw = import.meta.env.ADMIN_NOTIFICATION_EMAILS ?? 'contact@biscuits-ia.com';
    const adminEmails = String(adminEmailsRaw).split(',').map((s) => s.trim()).filter(Boolean);
    if (adminEmails.length === 0) return;

    const fromAddress = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA - Mailer' };
    const subject = `[ALERTE] Email en echec definitif : ${row.subject}`;
    const text = [
      `L'email suivant a echoue apres ${attempts} tentatives et est maintenant en statut "dead".`,
      ``,
      `Destinataire : ${row.to_email}`,
      `Sujet       : ${row.subject}`,
      `Queue ID    : ${row.id}`,
      `Derniere erreur : ${lastResponse}`,
      ``,
      `Consultez l'outbox : https://biscuits-ia.com/dashboard/admin/logs#outbox`,
    ].join('\n');
    const html = `<!DOCTYPE html><html><body style="font-family:monospace;background:#fef3d8;padding:20px;border:4px solid #a02020">
      <h2 style="color:#a02020">Email en echec definitif</h2>
      <pre>${text.replace(/</g, '&lt;')}</pre>
    </body></html>`;

    for (const email of adminEmails) {
      await sendMailDirect({
        from: fromAddress,
        to: { email },
        subject,
        text,
        html,
      });
    }
  } catch (err) {
    console.error('[email-queue] notifyAdminOfDeadEmail error:', err);
  }
}

// --------------------------------------------------------------------------
// Statistiques (pour le dashboard admin)
// --------------------------------------------------------------------------

export interface OutboxStats {
  pending:  number;
  sending:  number;
  sent:     number;
  failed:   number;
  dead:     number;
  total:    number;
}

export async function getOutboxStats(): Promise<OutboxStats> {
  // FIX P1 2.5 : appel de la RPC SQL get_outbox_stats() au lieu de SELECT *.
  // Voir migration 20260624_get_outbox_stats_rpc.sql. Retourne 6 entiers.
  const admin = createSupabaseAdminClient();
  try {
    const { data, error } = await admin.rpc('get_outbox_stats');
    if (error || !data) {
      console.warn('[email-queue] get_outbox_stats RPC failed, fallback empty:', error?.message);
      return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Partial<OutboxStats> | undefined;
    if (!row) return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };
    return {
      pending: Number(row.pending ?? 0),
      sending: Number(row.sending ?? 0),
      sent:    Number(row.sent ?? 0),
      failed:  Number(row.failed ?? 0),
      dead:    Number(row.dead ?? 0),
      total:   Number(row.total ?? 0),
    };
  } catch (err) {
    console.error('[email-queue] getOutboxStats unexpected error:', err);
    return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };
  }
}