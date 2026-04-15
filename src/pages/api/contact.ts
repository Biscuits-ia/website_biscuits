import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const json = (key: string, msg: string) =>
    new Response(JSON.stringify({ message: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json('parse', 'Corps de la requête invalide.');
  }

  const name    = typeof body.name    === 'string' ? body.name.trim()    : '';
  const email   = typeof body.email   === 'string' ? body.email.trim().toLowerCase() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  // Validation
  const errors: Record<string, string[]> = {};
  if (!name)                   errors.name    = ['Le nom est obligatoire.'];
  else if (name.length > 100)  errors.name    = ['Maximum 100 caractères.'];
  if (!email)                  errors.email   = ["L'email est obligatoire."];
  else if (!EMAIL_RE.test(email)) errors.email = ['Email invalide.'];
  if (!subject)                errors.subject = ['Le sujet est obligatoire.'];
  else if (subject.length > 150) errors.subject = ['Maximum 150 caractères.'];
  if (!message)                errors.message = ['Le message est obligatoire.'];
  else if (message.length < 20) errors.message = ['Minimum 20 caractères.'];
  else if (message.length > 2000) errors.message = ['Maximum 2000 caractères.'];

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Insert via service role (anon RLS also allows insert, but service_role is safer for server-side)
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
