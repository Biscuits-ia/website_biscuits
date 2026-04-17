import { Resend } from 'resend';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export type EmailTemplate = 'password-reset' | 'signup-confirmation' | 'email-change' | 'reauthentication';

interface EmailParams {
  template: EmailTemplate;
  email: string;
  confirmationUrl?: string;
  token?: string;
  oldEmail?: string;
  newEmail?: string;
}

/**
 * Envoie un email via Resend
 * @see https://resend.com/docs
 */
export async function sendEmail(params: EmailParams) {
  const { template, email, confirmationUrl, token, oldEmail, newEmail } = params;

  const templates: Record<EmailTemplate, { subject: string; html: string }> = {
    'password-reset': {
      subject: 'Réinitialisation de mot de passe',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin:0; padding:0; background:#f5f5f5;">
<div style="max-width:600px; margin:20px auto; background:#fff; border-radius:8px; padding:40px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<h1 style="margin:0 0 10px 0; font-size:20px; color:#333;">Réinitialiser votre mot de passe</h1>
<p style="margin:0 0 20px 0; color:#666; line-height:1.6; font-size:14px;">Bonjour,</p>
<p style="margin:0 0 20px 0; color:#666; line-height:1.6; font-size:14px;">Vous avez demandé une réinitialisation de mot de passe. Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="padding:15px 0;"><a href="${confirmationUrl}" style="display:inline-block; background:#2563eb; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">Réinitialiser le mot de passe</a></td></tr></table>
<p style="margin:20px 0 0 0; color:#888; font-size:12px;">Ce lien expire dans 24h. Si vous n'avez pas demandé ce changement, ignorez cet email.</p>
<hr style="border:none; border-top:1px solid #ddd; margin:30px 0;">
<p style="margin:0; color:#999; font-size:11px;">© 2026 Biscuits IA</p>
</div>
</body>
</html>`,
    },
    'signup-confirmation': {
      subject: 'Confirmez votre inscription',
      html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f6f7fb; font-family:Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; padding:40px;">
        <tr>
          <td align="center">
            <h1 style="margin:0; color:#111; font-size:24px;">🍪 Biscuits IA</h1>
            <h2 style="margin-top:20px; margin-bottom:0; color:#222; font-size:18px;">Confirmez votre inscription</h2>
            <p style="color:#555; line-height:1.6; margin-top:16px; font-size:14px;">
              Merci de vous être inscrit sur <strong>Biscuits IA</strong>.<br>Cliquez sur le bouton ci-dessous pour confirmer votre adresse email.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td>
                  <a href="${confirmationUrl}" style="display:inline-block; background:#c4623a; color:#ffffff; padding:12px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">
                    Confirmer mon email
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin-top:32px; font-size:13px; color:#888; line-height:1.6;">
              Si vous n'êtes pas à l'origine de cette inscription,<br>vous pouvez ignorer cet email.
            </p>
            <hr style="border:none; border-top:1px solid #e5e5e5; margin:32px 0;">
            <p style="margin:0; font-size:11px; color:#999;">© 2026 Biscuits IA — IA accessible pour tous</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
    },
    'email-change': {
      subject: 'Confirmez votre changement d\'email',
      html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f6f7fb; font-family:Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; padding:40px;">
        <tr>
          <td align="center">
            <h1 style="margin:0; color:#111; font-size:24px;">🍪 Biscuits IA</h1>
            <h2 style="margin-top:20px; margin-bottom:0; color:#222; font-size:18px;">Confirmez votre changement d'email</h2>
            <p style="color:#555; line-height:1.6; margin-top:16px; font-size:14px;">
              Vous avez demandé à modifier votre adresse email sur <strong>Biscuits IA</strong>.
            </p>
            <div style="margin-top:24px; padding:16px; background:#f9f9f9; border-radius:6px; border-left:4px solid #c4623a;">
              <p style="margin:8px 0; font-size:13px; color:#555;">
                <strong>Ancien email :</strong><br>${oldEmail}
              </p>
              <p style="margin:8px 0; font-size:13px; color:#555;">
                <strong>Nouvel email :</strong><br>${newEmail}
              </p>
            </div>
            <p style="color:#555; margin-top:24px; font-size:14px;">
              Cliquez sur le bouton ci-dessous pour confirmer ce changement.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td>
                  <a href="${confirmationUrl}" style="display:inline-block; background:#c4623a; color:#ffffff; padding:12px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">
                    Confirmer le changement
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin-top:32px; font-size:13px; color:#888; line-height:1.6;">
              Si vous n'êtes pas à l'origine de cette demande,<br>vous pouvez ignorer cet email.
            </p>
            <hr style="border:none; border-top:1px solid #e5e5e5; margin:32px 0;">
            <p style="margin:0; font-size:11px; color:#999;">© 2026 Biscuits IA — IA accessible pour tous</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
    },
    'reauthentication': {
      subject: 'Confirmation de ré-authentification',
      html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f6f7fb; font-family:Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; padding:40px;">
        <tr>
          <td align="center">
            <h1 style="margin:0; color:#111; font-size:24px;">🍪 Biscuits IA</h1>
            <h2 style="margin-top:20px; margin-bottom:0; color:#222; font-size:18px;">Confirmation de ré-authentification</h2>
            <p style="color:#555; line-height:1.6; margin-top:16px; font-size:14px;">
              Pour continuer, veuillez entrer le code de sécurité suivant sur Biscuits IA :
            </p>
            <div style="margin:32px 0; padding:20px; background:#f1f5f9; border-radius:8px; border-left:4px solid #c4623a;">
              <p style="margin:0; font-size:12px; color:#666; text-transform:uppercase; letter-spacing:1px;">Code de sécurité</p>
              <p style="margin:12px 0 0 0; font-size:32px; letter-spacing:8px; font-weight:bold; color:#111; font-family:monospace; text-align:center;">${token}</p>
            </div>
            <p style="color:#555; margin:24px 0; font-size:14px; line-height:1.6;">
              Ce code est requis pour vérifier votre identité et protéger votre compte.
            </p>
            <p style="margin:24px 0; padding:16px; background:#fff3cd; border-left:4px solid #c4623a; border-radius:4px; font-size:13px; color:#664d00; line-height:1.6;">
              <strong>⚠️ Attention :</strong><br>Ne partagez jamais ce code avec quiconque.
            </p>
            <p style="margin-top:32px; font-size:13px; color:#888; line-height:1.6;">
              Si vous n'êtes pas à l'origine de cette demande,<br>ignorez cet email ou sécurisez immédiatement votre compte.
            </p>
            <hr style="border:none; border-top:1px solid #e5e5e5; margin:32px 0;">
            <p style="margin:0; font-size:11px; color:#999;">© 2026 Biscuits IA — IA accessible pour tous</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
    },
  };

  const tmpl = templates[template];
  if (!tmpl) {
    throw new Error(`Template unknown: ${template}`);
  }

  try {
    const result = await resend.emails.send({
      from: 'Biscuits IA <noreply@biscuits-ia.com>',
      to: email,
      subject: tmpl.subject,
      html: tmpl.html,
    });

    return result;
  } catch (error) {
    console.error('[Resend] Email send error:', error);
    throw error;
  }
}
