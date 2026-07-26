import { enqueueEmail } from './email-queue';
import { formatDateTimeLong } from './dateHelpers';
import type { RecruitmentSession, RecruitmentSubmission } from '@/types/recruitment';

const FROM = { email: import.meta.env.SMTP_FROM || 'noreply@biscuits-ia.com', name: 'Biscuits IA' };

// Heure de Paris explicite : ce code tourne sur Vercel, dont le fuseau serveur
// est UTC. Sans cela, le candidat recevait une convocation decalee de 1 a 2 h.
const formatSessionDate = formatDateTimeLong;

function emailWrapper(title: string, body: string, preheader?: string): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${preheader ? `<span style="display:none">${escapeHtml(preheader)}</span>` : ''}
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #2a2424; background: #faf5ec; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #fdfaf3; border: 4px solid #2a2424; box-shadow: 6px 6px 0 #2a2424; padding: 32px; }
    h1 { font-size: 1.5rem; margin: 0 0 16px; color: #5c3a1a; letter-spacing: -0.02em; }
    p { margin: 0 0 12px; }
    .meta { background: #fdf3d8; border: 2px solid #2a2424; padding: 12px 16px; margin: 16px 0; }
    .meta dt { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; color: #8a5a2a; margin-top: 6px; }
    .meta dd { margin: 0; }
    .footer { font-size: 0.8rem; color: #8a5a2a; margin-top: 32px; padding-top: 16px; border-top: 2px solid #d8c3a0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    ${body}
    <div class="footer">
      Association Loi 1901 - RNA W863012707 - SIRET 10151660700013<br />
      <a href="https://biscuits-ia.com" style="color:#8a5a2a">biscuits-ia.com</a>
    </div>
  </div>
</body>
</html>`;

  // Version texte : construite depuis le corps seul. La derivation depuis le
  // HTML complet embarquait le contenu de <head> (lang, <title>, CSS residuel)
  // en tete du message texte.
  const text = `${title}\n\n${body
    .replace(/<\/(p|dd|dt|div|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()}`;

  return { html, text };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifySessionAssigned(submission: RecruitmentSubmission, session: RecruitmentSession) {
  const { html, text } = emailWrapper(
    'Session de recrutement confirmée',
    `<p>Bonjour ${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)},</p>
     <p>Votre candidature a été rattachée à une session de recrutement collective :</p>
     <dl class="meta">
       <dt>Session</dt><dd>${escapeHtml(session.title)}</dd>
       <dt>Date</dt><dd>${escapeHtml(formatSessionDate(session.scheduled_at))}</dd>
       <dt>Durée</dt><dd>${session.duration_minutes} minutes</dd>
       ${session.location ? `<dt>Lieu / Lien</dt><dd>${escapeHtml(session.location)}</dd>` : ''}
     </dl>
     <p>Nous vous recontacterons si la session venait à être déplacée ou annulée.</p>
     <p>À très bientôt,<br/>L'équipe Biscuits IA</p>`,
    `Vous êtes inscrit(e) à la session ${session.title}`,
  );

  await enqueueEmail(
    {
      from: FROM,
      to: { email: submission.email, name: `${submission.first_name} ${submission.last_name}` },
      subject: `Biscuits IA — Session de recrutement confirmée`,
      text,
      html,
    },
    { metadata: { type: 'recruitment_session_assigned', session_id: session.id, submission_id: submission.id } },
  );
}

export async function notifySessionUnassigned(submission: RecruitmentSubmission) {
  const { html, text } = emailWrapper(
    'Retrait de la session de recrutement',
    `<p>Bonjour ${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)},</p>
     <p>Vous avez été retiré(e) de la session de recrutement à laquelle vous étiez affecté(e). Votre candidature reste enregistrée et notre équipe vous recontactera si une nouvelle session est programmée.</p>
     <p>À très bientôt,<br/>L'équipe Biscuits IA</p>`,
    'Retrait de session de recrutement',
  );

  await enqueueEmail(
    {
      from: FROM,
      to: { email: submission.email, name: `${submission.first_name} ${submission.last_name}` },
      subject: `Biscuits IA — Mise à jour de votre candidature`,
      text,
      html,
    },
    { metadata: { type: 'recruitment_session_unassigned', submission_id: submission.id } },
  );
}

export async function notifyStatusDecision(submission: RecruitmentSubmission) {
  const isAccepted = submission.status === 'accepted';
  const title = isAccepted ? 'Candidature acceptée 🎉' : 'Candidature non retenue';
  const body = isAccepted
    ? `<p>Bonjour ${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)},</p>
       <p>Nous avons le plaisir de vous informer que votre candidature de bénévole a été <strong>acceptée</strong> !</p>
       <p>L'équipe vous contactera très prochainement pour les prochaines étapes d'intégration.</p>
       <p>Bienvenue chez Biscuits IA,<br/>L'équipe</p>`
    : `<p>Bonjour ${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)},</p>
       <p>Nous vous remercions pour l'intérêt que vous portez à Biscuits IA. Malheureusement, votre candidature n'a pas été retenue cette fois-ci.</p>
       <p>Nous vous souhaitons le meilleur dans vos futures engagements.</p>
       <p>L'équipe Biscuits IA</p>`;

  const { html, text } = emailWrapper(title, body, title);

  await enqueueEmail(
    {
      from: FROM,
      to: { email: submission.email, name: `${submission.first_name} ${submission.last_name}` },
      subject: `Biscuits IA — ${title}`,
      text,
      html,
    },
    { metadata: { type: 'recruitment_status_decision', submission_id: submission.id, status: submission.status } },
  );
}
