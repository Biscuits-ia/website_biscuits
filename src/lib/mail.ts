// ============================================================================
// src/lib/mail.ts
// ----------------------------------------------------------------------------
// Client SMTP minimaliste implemente a partir de zero (zero dep externe).
// Supporte :
//   - SMTP en clair (port 25)
//   - SMTP+STARTTLS (port 587, defaut OVH)
//   - SMTP sur TLS (port 465, SSL direct)
//
// Pourquoi from-scratch ? Le projet est en sandbox sans acces reseau a
// npmjs.org : impossible d'installer nodemailer. Le protocole SMTP est un
// protocole texte sur TCP, suffisant pour 95 % des serveurs (OVH, Gmail,
// SendGrid, Mailgun, etc.).
//
// L'API exposee imite nodemailer (sendMail) pour garder les call-sites
// lisibles, et reste 100 % typee.
// ============================================================================

import { Buffer } from 'node:buffer';
import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SmtpConfig {
  host:     string;
  port:     number;
  /** SSL direct (port 465) ou STARTTLS (port 587). */
  secure:   boolean;
  user:     string;
  password: string;
}

export interface MailAddress {
  email: string;
  name?: string;
}

export interface MailAttachment {
  filename:     string;
  content:      Buffer | string;   // texte ou binaire
  contentType?: string;             // defaut: application/octet-stream
  encoding?:    'base64' | 'utf-8';
}

export interface MailMessage {
  to:        MailAddress | MailAddress[];
  cc?:       MailAddress | MailAddress[];
  bcc?:      MailAddress | MailAddress[];
  replyTo?:  MailAddress | MailAddress[];
  from:      MailAddress;             // requis
  subject:   string;
  text?:     string;                  // plain-text fallback
  html?:     string;                  // preferred
  attachments?: MailAttachment[];
  headers?:  Record<string, string>;  // headers custom (ex: List-Unsubscribe)
  /** Genere un Message-ID si absent. */
  messageId?: string;
  /** Metadata pour debug/outbox (type d'email, contexte). Stockee dans email_outbox.metadata. */
  metadata?:  Record<string, string | number | boolean | null>;
}

export interface MailSendResult {
  messageId: string;
  accepted:  string[];
  rejected:  string[];
  /** Reponse SMTP finale du serveur. */
  response:  string;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Formate une adresse email au format "Name <addr@host>" ou "addr@host". */
function formatAddress(addr: MailAddress): string {
  // RFC 5322 : le nom peut contenir des espaces, on l'encode en UTF-8 quoted.
  // Pour simplifier, on encode le nom avec =?UTF-8?B?...?= si necessaire.
  if (!addr.name) return addr.email;
  const safeName = addr.name.replace(/[<>\"]/g, '');
  if (/^[\w .'-]+$/.test(safeName)) {
    return `"${safeName}" <${addr.email}>`;
  }
  const encoded = Buffer.from(safeName, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?= <${addr.email}>`;
}

function flattenAddresses(addrs: MailAddress | MailAddress[] | undefined): string[] {
  if (!addrs) return [];
  return (Array.isArray(addrs) ? addrs : [addrs]).map((a) => a.email);
}

/** Genere un Message-ID unique. */
function generateMessageId(domain: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `<${ts}.${rnd}@${domain}>`;
}

/** Encode en Base64 sans retours a la ligne (RFC 5321 limite 76). */
function base64Chunked(buf: Buffer): string {
  const b64 = buf.toString('base64');
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64;
}

// --------------------------------------------------------------------------
// Client SMTP bas-niveau
// --------------------------------------------------------------------------

class SmtpClient {
  private socket: Socket | TLSSocket | null = null;
  private buffer = '';
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    const { host, port, secure } = this.config;
    if (secure) {
      // SSL/TLS direct
      this.socket = tlsConnect({ host, port, servername: host });
    } else {
      // PLAIN puis STARTTLS
      this.socket = createConnection({ host, port });
    }
    await new Promise<void>((resolve, reject) => {
      const sock = this.socket!;
      const onError = (err: Error) => reject(err);
      sock.once('error', onError);
      sock.once('connect', () => { sock.removeListener('error', onError); resolve(); });
      if (secure) {
        (sock as TLSSocket).once('secureConnect', () => { sock.removeListener('error', onError); resolve(); });
      }
    });
    this.socket.setEncoding('utf-8');
    await this.expectReply(220); // 220 ready
  }

  private async readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      const sock = this.socket!;
      const onData = (chunk: string) => {
        this.buffer += chunk;
        const idx = this.buffer.indexOf('\n');
        if (idx >= 0) {
          sock.removeListener('data', onData);
          sock.removeListener('error', onError);
          sock.removeListener('end', onEnd);
          const line = this.buffer.slice(0, idx).replace(/\r$/, '');
          this.buffer = this.buffer.slice(idx + 1);
          resolve(line);
        }
      };
      const onError = (err: Error) => {
        sock.removeListener('data', onData);
        sock.removeListener('end', onEnd);
        reject(err);
      };
      const onEnd = () => {
        sock.removeListener('data', onData);
        sock.removeListener('error', onError);
        reject(new Error('SMTP connection closed unexpectedly'));
      };
      sock.on('data', onData);
      sock.once('error', onError);
      sock.once('end', onEnd);
    });
  }

  private async expectReply(expected: number): Promise<string> {
    const firstLine = await this.readLine();
    // Les reponses multi-lignes commencent par "ddd-" (ex: 250-SIZE ...).
    if (/^\d{3}-/.test(firstLine)) {
      let full = firstLine;
      while (true) {
        const next = await this.readLine();
        full += '\n' + next;
        if (/^\d{3} /.test(next)) {
          if (parseInt(next.slice(0, 3), 10) !== expected) {
            throw new Error(`SMTP unexpected reply: ${full}`);
          }
          return full;
        }
      }
    }
    const code = parseInt(firstLine.slice(0, 3), 10);
    if (code !== expected) {
      throw new Error(`SMTP unexpected reply ${code}: ${firstLine}`);
    }
    return firstLine;
  }

  private sendLine(line: string): void {
    this.socket!.write(line + '\r\n');
  }

  async ehlo(): Promise<void> {
    this.sendLine(`EHLO localhost`);
    await this.expectReply(250);
  }

  async startTlsIfNeeded(): Promise<void> {
    if (this.config.secure) return; // deja en TLS
    const sock = this.socket as Socket;
    this.sendLine('STARTTLS');
    await this.expectReply(220);
    // Upgrade vers TLS
    const upgraded = tlsConnect({
      socket: sock,
      servername: this.config.host,
    });
    await new Promise<void>((resolve, reject) => {
      upgraded.once('secureConnect', () => resolve());
      upgraded.once('error', reject);
    });
    upgraded.setEncoding('utf-8');
    this.socket = upgraded;
    // Re-EHLO apres STARTTLS (RFC 3207)
    await this.ehlo();
  }

  async auth(): Promise<void> {
    this.sendLine('AUTH LOGIN');
    await this.expectReply(334); // "VXNlcm5hbWU6" (base64 de "Username:")
    this.sendLine(base64Chunked(Buffer.from(this.config.user, 'utf-8')));
    await this.expectReply(334); // "UGFzc3dvcmQ6"
    this.sendLine(base64Chunked(Buffer.from(this.config.password, 'utf-8')));
    await this.expectReply(235); // Authentication successful
  }

  async send(from: string, to: string[], data: Buffer): Promise<string> {
    this.sendLine(`MAIL FROM:<${from}>`);
    await this.expectReply(250);
    for (const rcpt of to) {
      this.sendLine(`RCPT TO:<${rcpt}>`);
      await this.expectReply(250);
    }
    this.sendLine('DATA');
    await this.expectReply(354);
    this.socket!.write(data);
    this.sendLine('.');
    return await this.expectReply(250);
  }

  async quit(): Promise<void> {
    try {
      this.sendLine('QUIT');
      await this.expectReply(221);
    } catch { /* best effort */ }
    this.socket?.end();
    this.socket?.destroy();
  }
}

// --------------------------------------------------------------------------
// Construction du message MIME
// --------------------------------------------------------------------------

function buildMime(msg: MailMessage, senderDomain: string): { data: Buffer; messageId: string } {
  const messageId = msg.messageId ?? generateMessageId(senderDomain);
  const date = new Date().toUTCString();

  const boundary = `mixed_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const altBoundary = `alt_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const hasAttachments = (msg.attachments?.length ?? 0) > 0;
  const hasAlt = !!msg.html && !!msg.text;
  const hasOnlyHtml = !!msg.html && !msg.text;

  const headers: string[] = [
    `Date: ${date}`,
    `From: ${formatAddress(msg.from)}`,
    `To: ${flattenAddresses(msg.to).map((e) => `<${e}>`).join(', ')}`,
  ];
  if (msg.cc) {
    headers.push(`Cc: ${flattenAddresses(msg.cc).map((e) => `<${e}>`).join(', ')}`);
  }
  if (msg.replyTo) {
    headers.push(`Reply-To: ${flattenAddresses(msg.replyTo).map((e) => `<${e}>`).join(', ')}`);
  }
  headers.push(
    `Subject: ${encodeHeader(msg.subject)}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  );
  if (msg.headers) {
    for (const [k, v] of Object.entries(msg.headers)) {
      headers.push(`${k}: ${v}`);
    }
  }
  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  } else if (hasAlt) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  } else if (hasOnlyHtml) {
    headers.push(`Content-Type: text/html; charset=utf-8`);
    headers.push(`Content-Transfer-Encoding: quoted-printable`);
  } else {
    headers.push(`Content-Type: text/plain; charset=utf-8`);
    headers.push(`Content-Transfer-Encoding: quoted-printable`);
  }

  const parts: string[] = [headers.join('\r\n'), '', ''];

  if (hasAttachments) {
    // multipart/mixed : boundary = boundary
    if (hasAlt) {
      parts.push(
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
      );
      parts.push(buildAltPart(msg, altBoundary));
      parts.push(`--${boundary}`);
    } else if (hasOnlyHtml) {
      parts.push(
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: quoted-printable`,
        '',
        encodeQuotedPrintable(msg.html ?? ''),
        '',
        `--${boundary}`,
      );
    } else {
      parts.push(
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: quoted-printable`,
        '',
        encodeQuotedPrintable(msg.text ?? ''),
        '',
        `--${boundary}`,
      );
    }
    // PJ
    for (const att of msg.attachments ?? []) {
      parts.push(...buildAttachmentPart(att));
      parts.push(`--${boundary}`);
    }
    parts[parts.length - 1] = `${parts[parts.length - 1]}--`; // closing
  } else if (hasAlt) {
    parts.push(buildAltPart(msg, altBoundary));
  } else if (hasOnlyHtml) {
    parts.push(encodeQuotedPrintable(msg.html ?? ''));
  } else {
    parts.push(encodeQuotedPrintable(msg.text ?? ''));
  }

  return {
    data: Buffer.from(parts.join('\r\n'), 'utf-8'),
    messageId,
  };
}

function buildAltPart(msg: MailMessage, boundary: string): string {
  const parts: string[] = [];
  if (msg.text) {
    parts.push(
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      '',
      encodeQuotedPrintable(msg.text),
      '',
    );
  }
  if (msg.html) {
    parts.push(
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      '',
      encodeQuotedPrintable(msg.html),
      '',
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}

function buildAttachmentPart(att: MailAttachment): string[] {
  const ct = att.contentType ?? 'application/octet-stream';
  const filename = encodeHeader(att.filename);
  const buf = typeof att.content === 'string' ? Buffer.from(att.content, 'utf-8') : att.content;
  return [
    `Content-Type: ${ct}; name="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    base64Chunked(buf),
    '',
  ];
}

/** Encode un header RFC 2047 si necessaire (avec caracteres non-ASCII). */
function encodeHeader(s: string): string {
  // ASCII pur : on retourne tel quel
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const encoded = Buffer.from(s, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

/** Encode quoted-printable simple (gere les caracteres > 127). */
function encodeQuotedPrintable(s: string): string {
  // Convertit les sauts de ligne en CRLF, encode les chars > 127.
  return s
    .replace(/\r?\n/g, '\r\n')
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code === 9 || code === 32) return c;
      if (code === 61 || code < 33 || code > 126) {
        return '=' + code.toString(16).toUpperCase().padStart(2, '0');
      }
      return c;
    })
    .join('');
}

// --------------------------------------------------------------------------
// API publique
// --------------------------------------------------------------------------

let smtpConfigCache: SmtpConfig | null = null;
function loadSmtpConfig(): SmtpConfig | null {
  if (smtpConfigCache) return smtpConfigCache;
  const host     = import.meta.env.SMTP_HOST;
  const portRaw  = import.meta.env.SMTP_PORT;
  const secureRaw = import.meta.env.SMTP_SECURE;
  const user     = import.meta.env.SMTP_USER;
  const password = import.meta.env.SMTP_PASSWORD;
  if (!host || !user || !password) {
    // SMTP non configure : on loggue en console uniquement (mode dev/test).
    return null;
  }
  const port = portRaw ? Number.parseInt(String(portRaw), 10) : 587;
  const secure = secureRaw === 'true' || secureRaw === true || port === 465;
  smtpConfigCache = { host: String(host), port, secure, user: String(user), password: String(password) };
  return smtpConfigCache;
}

/**
 * Envoie un email. Si SMTP n'est pas configure, log en console et retourne
 * un objet avec accepted: [] (mode dev). Ne leve jamais d'exception
 * cote caller (les appels sont en best-effort depuis les routes API).
 */
export async function sendMail(msg: MailMessage): Promise<MailSendResult> {
  const config = loadSmtpConfig();
  const allRecipients = [
    ...flattenAddresses(msg.to),
    ...flattenAddresses(msg.cc),
    ...flattenAddresses(msg.bcc),
  ];

  // From domain
  const fromDomain = msg.from.email.split('@')[1] ?? 'localhost';
  const { data, messageId } = buildMime(msg, fromDomain);

  if (!config) {
    // Pas de SMTP : on log en console
    console.log('[mail] SMTP not configured, logging only:');
    console.log(`[mail] From: ${formatAddress(msg.from)}`);
    console.log(`[mail] To: ${allRecipients.join(', ')}`);
    console.log(`[mail] Subject: ${msg.subject}`);
    console.log(`[mail] Body (text): ${(msg.text ?? '').slice(0, 200)}...`);
    return {
      messageId,
      accepted: [],
      rejected: [],
      response: 'smtp-not-configured',
    };
  }

  const client = new SmtpClient(config);
  try {
    await client.connect();
    await client.ehlo();
    await client.startTlsIfNeeded();
    await client.auth();
    const response = await client.send(msg.from.email, allRecipients, data);
    return {
      messageId,
      accepted: allRecipients,
      rejected: [],
      response,
    };
  } catch (err) {
    console.error('[mail] sendMail error:', err instanceof Error ? err.message : String(err));
    return {
      messageId,
      accepted: [],
      rejected: allRecipients,
      response: err instanceof Error ? err.message : 'error',
    };
  } finally {
    await client.quit();
  }
}

// --------------------------------------------------------------------------
// Templates HTML (coherent avec le style brutaliste du site)
// --------------------------------------------------------------------------

const EMAIL_CSS = `
  body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #2a2424; background: #faf5ec; margin: 0; padding: 24px; }
  .container { max-width: 600px; margin: 0 auto; background: #fdfaf3; border: 4px solid #2a2424; box-shadow: 6px 6px 0 #2a2424; padding: 32px; }
  h1 { font-size: 1.5rem; margin: 0 0 16px; color: #5c3a1a; letter-spacing: -0.02em; }
  h2 { font-size: 1.15rem; margin: 24px 0 8px; color: #5c3a1a; }
  p  { margin: 0 0 12px; }
  .meta { background: #fdf3d8; border: 2px solid #2a2424; padding: 12px 16px; margin: 16px 0; }
  .meta dt { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; color: #8a5a2a; margin-top: 6px; }
  .meta dd { margin: 0; }
  .btn { display: inline-block; padding: 12px 24px; background: #8a5a2a; color: #fdfaf3; text-decoration: none; font-weight: 700; border: 3px solid #2a2424; box-shadow: 4px 4px 0 #2a2424; margin: 16px 0; }
  .footer { font-size: 0.8rem; color: #8a5a2a; margin-top: 32px; padding-top: 16px; border-top: 2px solid #d8c3a0; }
  code { font-family: ui-monospace, monospace; background: #fdf3d8; padding: 2px 6px; border: 1px solid #d8c3a0; }
`;

function emailLayout(content: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Biscuits IA</title>
  ${preheader ? `<span style="display:none">${preheader}</span>` : ''}
  <style>${EMAIL_CSS}</style>
</head>
<body>
  <div class="container">
    <h1>Biscuits IA</h1>
    ${content}
    <div class="footer">
      Association Loi 1901 - RNA W863012707 - SIRET 10151660700013<br />
      <a href="https://biscuits-ia.com" style="color:#8a5a2a">biscuits-ia.com</a>
    </div>
  </div>
</body>
</html>`;
}

export interface RegistrationConfirmationData {
  userName:      string;
  trainingTitle: string;
  sessionDate:   string;          // texte formate fr-FR
  sessionTime:   string;
  location:      string;
  amount:        string;          // texte formate "35,00 EUR" ou "Gratuit"
  paymentMethod: string;          // "Virement bancaire" | "Place offerte" | etc.
  nextSteps:     string;          // texte
  isFree:        boolean;
  bankInfo?:     string;          // instructions virement (si applicable)
}

export function renderRegistrationConfirmation(d: RegistrationConfirmationData): { html: string; text: string } {
  const html = emailLayout(`
    <h1>Inscription enregistree</h1>
    <p>Bonjour <strong>${escapeHtml(d.userName)}</strong>,</p>
    <p>Votre inscription a bien ete prise en compte. Voici le recapitulatif :</p>
    <dl class="meta">
      <dt>Formation</dt><dd>${escapeHtml(d.trainingTitle)}</dd>
      <dt>Date</dt><dd>${escapeHtml(d.sessionDate)}</dd>
      <dt>Horaire</dt><dd>${escapeHtml(d.sessionTime)}</dd>
      <dt>Lieu</dt><dd>${escapeHtml(d.location)}</dd>
      <dt>Montant</dt><dd>${escapeHtml(d.amount)}</dd>
      <dt>Paiement</dt><dd>${escapeHtml(d.paymentMethod)}</dd>
    </dl>
    <h2>Prochaines etapes</h2>
    <p>${escapeHtml(d.nextSteps)}</p>
    ${d.bankInfo ? `<h2>Coordonnees bancaires</h2><pre style="white-space:pre-wrap;font-family:inherit;background:#fdf3d8;padding:12px;border:2px solid #2a2424">${escapeHtml(d.bankInfo)}</pre>` : ''}
    ${d.isFree ? '<p><em>Votre place est confirmee. A bientot !</em></p>' : '<p>Votre place sera definitivee des reception du paiement.</p>'}
  `, `Inscription confirmee : ${d.trainingTitle}`);
  const text = `Inscription enregistree

Bonjour ${d.userName},

Votre inscription a bien ete prise en compte.

Formation : ${d.trainingTitle}
Date : ${d.sessionDate}
Horaire : ${d.sessionTime}
Lieu : ${d.location}
Montant : ${d.amount}
Paiement : ${d.paymentMethod}

Prochaines etapes :
${d.nextSteps}
${d.bankInfo ? `\nCoordonnees bancaires :\n${d.bankInfo}` : ''}
${d.isFree ? '\nVotre place est confirmee. A bientot !' : '\nVotre place sera definitivee des reception du paiement.'}

--
Biscuits IA - Association Loi 1901
https://biscuits-ia.com`;
  return { html, text };
}

export interface FreeRequestData {
  userName:        string;
  trainingTitle:   string;
  sessionDate:     string;
  reason:          string;
  status:          'pending' | 'approved' | 'refused';
  adminNote?:      string;
}

export function renderFreeRequestDecision(d: FreeRequestData): { html: string; text: string } {
  const isApproved = d.status === 'approved';
  const statusLabel = isApproved ? 'approuvee' : (d.status === 'refused' ? 'refusee' : 'en cours');
  const color = isApproved ? '#1a6b3a' : (d.status === 'refused' ? '#a02020' : '#8a5a2a');
  const html = emailLayout(`
    <h1 style="color:${color}">Votre demande d'exoneration a ete ${statusLabel}</h1>
    <p>Bonjour <strong>${escapeHtml(d.userName)}</strong>,</p>
    <p>Concernant votre demande d'exoneration pour la session <strong>${escapeHtml(d.trainingTitle)}</strong> du ${escapeHtml(d.sessionDate)}.</p>
    <p>Statut : <strong>${statusLabel}</strong></p>
    ${d.adminNote ? `<h2>Note de l'equipe</h2><blockquote style="border-left:4px solid #8a5a2a;padding-left:12px;margin-left:0;color:#5c3a1a">${escapeHtml(d.adminNote)}</blockquote>` : ''}
    ${isApproved ? '<p><a href="https://biscuits-ia.com/dashboard/user/formations" class="btn">Voir mes formations</a></p>' : ''}
  `, `Demande d'exoneration ${statusLabel}`);
  const text = `Votre demande d'exoneration a ete ${statusLabel}

Bonjour ${d.userName},

Concernant votre demande d'exoneration pour la session ${d.trainingTitle} du ${d.sessionDate}.

Statut : ${statusLabel}
${d.adminNote ? `Note de l'equipe : ${d.adminNote}` : ''}
${isApproved ? '\nVoir mes formations : https://biscuits-ia.com/dashboard/user/formations' : ''}

--
Biscuits IA - Association Loi 1901
https://biscuits-ia.com`;
  return { html, text };
}

export interface SponsorshipConfirmationData {
  sponsorName:    string;
  amount:         string;          // "50,00 EUR"
  mode:           'pool' | 'nominative';
  beneficiaryEmail?: string;
  trainingTitle?:  string;
  redemptionCode: string;
  adminLink:      string;          // lien vers /dashboard/admin/formations pour activer le code
}

export function renderSponsorshipConfirmation(d: SponsorshipConfirmationData): { html: string; text: string } {
  const html = emailLayout(`
    <h1>Parrainage enregistre</h1>
    <p>Bonjour <strong>${escapeHtml(d.sponsorName)}</strong>,</p>
    <p>Merci pour votre parrainage ! Voici votre code de redemption :</p>
    <p style="text-align:center"><code style="font-size:1.4rem;padding:12px 24px">${escapeHtml(d.redemptionCode)}</code></p>
    <dl class="meta">
      <dt>Montant</dt><dd>${escapeHtml(d.amount)}</dd>
      <dt>Mode</dt><dd>${d.mode === 'pool' ? 'Pool libre (premier beneficiaire)' : `Nominatif (pour ${escapeHtml(d.beneficiaryEmail ?? '')})`}</dd>
      ${d.trainingTitle ? `<dt>Formation visee</dt><dd>${escapeHtml(d.trainingTitle)}</dd>` : ''}
    </dl>
    <h2>Prochaine etape</h2>
    <p>Une fois votre paiement recu, un admin activera le code. Vous recevrez alors un email de confirmation, et le beneficiaire pourra consommer la place lors de son inscription.</p>
    <p><em>Le code de redemption reste valide tant qu'il n'a pas ete utilise.</em></p>
  `, `Votre code parrainage : ${d.redemptionCode}`);
  const text = `Parrainage enregistre

Bonjour ${d.sponsorName},

Merci pour votre parrainage !

Code de redemption : ${d.redemptionCode}
Montant : ${d.amount}
Mode : ${d.mode === 'pool' ? 'Pool libre' : `Nominatif (pour ${d.beneficiaryEmail})`}
${d.trainingTitle ? `Formation visee : ${d.trainingTitle}\n` : ''}
Une fois votre paiement recu, un admin activera le code.

--
Biscuits IA - Association Loi 1901
https://biscuits-ia.com`;
  return { html, text };
}

export interface AdminNotificationData {
  adminName:      string;
  type:           'new_registration' | 'new_free_request' | 'new_sponsorship' | 'payment_received';
  trainingTitle:  string;
  sessionDate?:   string;
  userName?:      string;
  amount?:        string;
  details:        string;
  adminLink:      string;
}

export function renderAdminNotification(d: AdminNotificationData): { html: string; text: string } {
  const typeLabels = {
    new_registration:  'Nouvelle inscription',
    new_free_request:  'Nouvelle demande d exoneration',
    new_sponsorship:   'Nouveau parrainage',
    payment_received:  'Paiement recu',
  };
  const html = emailLayout(`
    <h1>${typeLabels[d.type]}</h1>
    <p>Bonjour <strong>${escapeHtml(d.adminName)}</strong>,</p>
    <dl class="meta">
      <dt>Formation</dt><dd>${escapeHtml(d.trainingTitle)}</dd>
      ${d.sessionDate ? `<dt>Session</dt><dd>${escapeHtml(d.sessionDate)}</dd>` : ''}
      ${d.userName ? `<dt>Utilisateur</dt><dd>${escapeHtml(d.userName)}</dd>` : ''}
      ${d.amount ? `<dt>Montant</dt><dd>${escapeHtml(d.amount)}</dd>` : ''}
    </dl>
    <p>${escapeHtml(d.details)}</p>
    <p><a href="${escapeHtml(d.adminLink)}" class="btn">Voir dans le dashboard admin</a></p>
  `, typeLabels[d.type]);
  const text = `${typeLabels[d.type]}

Formation : ${d.trainingTitle}
${d.sessionDate ? `Session : ${d.sessionDate}\n` : ''}${d.userName ? `Utilisateur : ${d.userName}\n` : ''}${d.amount ? `Montant : ${d.amount}\n` : ''}
${d.details}

Dashboard admin : ${d.adminLink}

--
Biscuits IA - Association Loi 1901`;
  return { html, text };
}

/** Echappement HTML minimal pour eviter XSS dans les templates. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}