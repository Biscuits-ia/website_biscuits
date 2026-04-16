import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';
import { verifyTurnstileToken, isTurnstileEnabled } from '@/lib/turnstile';

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

  const first_name   = typeof body.first_name   === 'string' ? body.first_name.trim()   : '';
  const last_name    = typeof body.last_name    === 'string' ? body.last_name.trim()    : '';
  const email        = typeof body.email        === 'string' ? body.email.trim().toLowerCase() : '';
  const skills       = typeof body.skills       === 'string' ? body.skills.trim() || null       : null;
  const availability = typeof body.availability === 'string' ? body.availability.trim() || null : null;
  const motivation   = typeof body.motivation   === 'string' ? body.motivation.trim() || null   : null;
  const turnstile_token = typeof body.turnstile_token === 'string' ? body.turnstile_token : null;

  // Validation
  const errors: Record<string, string[]> = {};
  if (!first_name)                    errors.first_name = ['Le prénom est obligatoire.'];
  else if (first_name.length > MAX_NAME)   errors.first_name = [`Maximum ${MAX_NAME} caractères.`];
  if (!last_name)                     errors.last_name  = ['Le nom est obligatoire.'];
  else if (last_name.length > MAX_NAME)    errors.last_name  = [`Maximum ${MAX_NAME} caractères.`];
  if (!email)                         errors.email      = ["L'email est obligatoire."];
  else if (!EMAIL_RE.test(email))     errors.email      = ['Email invalide.'];

  // Vérifier Turnstile si configuré
  if (isTurnstileEnabled()) {
    if (!turnstile_token) {
      errors.turnstile_token = ['Veuillez compléter la vérification de sécurité.'];
    } else {
      const turnstileResult = await verifyTurnstileToken(turnstile_token, clientAddress);
      if (!turnstileResult.success) {
        errors.turnstile_token = ['Vérification de sécurité échouée. Veuillez réessayer.'];
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('recruitment_submissions')
    .insert({ first_name, last_name, email, skills, availability, motivation });

  if (error) {
    return new Response(JSON.stringify({ message: 'Erreur lors de l\'enregistrement.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Candidature envoyée avec succès.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
