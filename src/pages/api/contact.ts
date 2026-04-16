import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME, MAX_SUBJECT, MIN_MESSAGE, MAX_MESSAGE } from '@/lib/validation';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Valider les champs
  const name    = typeof body.name    === 'string' ? body.name.trim()    : '';
  const email   = typeof body.email   === 'string' ? body.email.trim().toLowerCase() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  // Validation
  const errors: Record<string, string[]> = {};
  if (!name)                   errors.name    = ['Le nom est obligatoire.'];
  else if (name.length > MAX_NAME)  errors.name    = [`Maximum ${MAX_NAME} caractères.`];
  if (!email)                  errors.email   = ["L'email est obligatoire."];
  else if (!EMAIL_RE.test(email)) errors.email = ['Email invalide.'];
  if (!subject)                errors.subject = ['Le sujet est obligatoire.'];
  else if (subject.length > MAX_SUBJECT) errors.subject = [`Maximum ${MAX_SUBJECT} caractères.`];
  if (!message)                errors.message = ['Le message est obligatoire.'];
  else if (message.length < MIN_MESSAGE) errors.message = [`Minimum ${MIN_MESSAGE} caractères.`];
  else if (message.length > MAX_MESSAGE) errors.message = [`Maximum ${MAX_MESSAGE} caractères.`];

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Insert via service role
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