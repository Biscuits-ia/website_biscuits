import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME, MAX_SUBJECT, MIN_MESSAGE, MAX_MESSAGE } from '@/lib/validation';

type ContactBody = Record<string, unknown>;

function parseContactBody(body: ContactBody) {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    subject: typeof body.subject === 'string' ? body.subject.trim() : '',
    message: typeof body.message === 'string' ? body.message.trim() : '',
  };
}

function validateContactFields(fields: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  if (!fields.name) {
    errors.name = ['Le nom est obligatoire.'];
  } else if (fields.name.length > MAX_NAME) {
    errors.name = [`Maximum ${MAX_NAME} caractères.`];
  }

  if (!fields.email) {
    errors.email = ["L'email est obligatoire."];
  } else if (!EMAIL_RE.test(fields.email)) {
    errors.email = ['Email invalide.'];
  }

  if (!fields.subject) {
    errors.subject = ['Le sujet est obligatoire.'];
  } else if (fields.subject.length > MAX_SUBJECT) {
    errors.subject = [`Maximum ${MAX_SUBJECT} caractères.`];
  }

  if (!fields.message) {
    errors.message = ['Le message est obligatoire.'];
  } else if (fields.message.length < MIN_MESSAGE) {
    errors.message = [`Minimum ${MIN_MESSAGE} caractères.`];
  } else if (fields.message.length > MAX_MESSAGE) {
    errors.message = [`Maximum ${MAX_MESSAGE} caractères.`];
  }

  return errors;
}

export const POST: APIRoute = async ({ request }) => {
  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, email, subject, message } = parseContactBody(body);

  const errors = validateContactFields({ name, email, subject, message });

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('contact_submissions')
    .insert({ name, email, subject, message });

  if (error) {
    return new Response(JSON.stringify({ message: 'Erreur lors de l\'enregistrement.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Demande envoyée avec succès.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};