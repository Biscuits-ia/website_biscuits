import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME, MAX_SUBJECT, MIN_MESSAGE, MAX_MESSAGE } from '@/lib/validation';
import { rateLimitRoute } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';

type ContactBody = Record<string, unknown>;
type ContactKind = 'general' | 'victime' | 'devis-logiciel' | 'signalement' | 'soutenir';

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_MS = 10 * 60_000;
const ALLOWED_KINDS: ContactKind[] = ['general', 'victime', 'devis-logiciel', 'signalement', 'soutenir'];

function parseContactBody(body: ContactBody) {
  const rawKind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
  const kind: ContactKind = (ALLOWED_KINDS as string[]).includes(rawKind) ? (rawKind as ContactKind) : 'general';
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    subject: typeof body.subject === 'string' ? body.subject.trim() : '',
    message: typeof body.message === 'string' ? body.message.trim() : '',
    kind,
    urgent: body.urgent === true,
  };
}

function validateContactFields(fields: { name: string; email: string; subject: string; message: string }): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (!fields.name) errors.name = ['Le nom est obligatoire.'];
  else if (fields.name.length > MAX_NAME) errors.name = [`Maximum ${MAX_NAME} caracteres.`];
  if (!fields.email) errors.email = ['L\'email est obligatoire.'];
  else if (!EMAIL_RE.test(fields.email)) errors.email = ['Email invalide.'];
  if (!fields.subject) errors.subject = ['Le sujet est obligatoire.'];
  else if (fields.subject.length > MAX_SUBJECT) errors.subject = [`Maximum ${MAX_SUBJECT} caracteres.`];
  if (!fields.message) errors.message = ['Le message est obligatoire.'];
  else if (fields.message.length < MIN_MESSAGE) errors.message = [`Minimum ${MIN_MESSAGE} caracteres.`];
  else if (fields.message.length > MAX_MESSAGE) errors.message = [`Maximum ${MAX_MESSAGE} caracteres.`];
  return errors;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // 1. Rate-limit dedie avant tout parsing (evite de couteux insert en BDD)
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = rateLimitRoute(ip, '/api/contact', CONTACT_LIMIT, CONTACT_WINDOW_MS);
  if (blocked) return blocked;

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requete invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, email, subject, message, kind, urgent } = parseContactBody(body);

  const errors = validateContactFields({ name, email, subject, message });

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Si kind=victime et que l'objet ne contient pas de sujet, on en force un
  // pour faciliter le tri cote dashboard admin.
  const finalSubject = subject || (kind === 'victime' ? 'Demande aide victime' : 'Demande de contact');

  // Champ `urgent` reserve aux victimes (sera ignore pour les autres kinds).
  const supabase = createSupabaseAdminClient();
  // On encode kind et urgent dans le message pour exploitation humaine en
  // attendant une colonne dediee en BDD (gain : zero migration requise).
  const enrichedMessage = `[kind=${kind}${urgent ? " urgent=true" : ""}]\n\n${message}`;
  const { error } = await supabase
    .from('contact_submissions')
    .insert({ name, email, subject: finalSubject, message: enrichedMessage });
  if (error) {
    return new Response(JSON.stringify({ message: "Erreur lors de l'enregistrement." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ message: 'Demande envoyee avec succes.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
