import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getRequestIp, verifyTurnstileToken } from '@/lib/turnstile';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';

type RecruitmentBody = Record<string, unknown>;

function parseRecruitmentBody(body: RecruitmentBody) {
  return {
    turnstileToken: typeof body.turnstileToken === 'string' ? body.turnstileToken : '',
    first_name: typeof body.first_name === 'string' ? body.first_name.trim() : '',
    last_name: typeof body.last_name === 'string' ? body.last_name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    skills: typeof body.skills === 'string' ? body.skills.trim() || null : null,
    availability: typeof body.availability === 'string' ? body.availability.trim() || null : null,
    motivation: typeof body.motivation === 'string' ? body.motivation.trim() || null : null,
  };
}

function validateRecruitmentFields(fields: {
  first_name: string;
  last_name: string;
  email: string;
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  if (!fields.first_name) {
    errors.first_name = ['Le prénom est obligatoire.'];
  } else if (fields.first_name.length > MAX_NAME) {
    errors.first_name = [`Maximum ${MAX_NAME} caractères.`];
  }

  if (!fields.last_name) {
    errors.last_name = ['Le nom est obligatoire.'];
  } else if (fields.last_name.length > MAX_NAME) {
    errors.last_name = [`Maximum ${MAX_NAME} caractères.`];
  }

  if (!fields.email) {
    errors.email = ["L'email est obligatoire."];
  } else if (!EMAIL_RE.test(fields.email)) {
    errors.email = ['Email invalide.'];
  }

  return errors;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: RecruitmentBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    turnstileToken,
    first_name,
    last_name,
    email,
    skills,
    availability,
    motivation,
  } = parseRecruitmentBody(body);
  const ip = getRequestIp(request, clientAddress);
  const isTokenValid = await verifyTurnstileToken(turnstileToken, ip);

  if (!isTokenValid) {
    return new Response(JSON.stringify({ message: 'Vérification Turnstile invalide ou expirée.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const errors = validateRecruitmentFields({ first_name, last_name, email });

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
