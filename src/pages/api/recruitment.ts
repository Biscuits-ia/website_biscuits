// src/pages/api/recruitment.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';
import { rateLimitRoute } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';

/**
 * Quota volontairement strict pour un endpoint public sans authentification :
 * 5 soumissions / IP / 10 min. Couvre un usage humain normal tout en
 * bloquant l'email-bombing et le scraping de la table recruitment_submissions.
 */
const RECRUITMENT_LIMIT = 5;
const RECRUITMENT_WINDOW_MS = 10 * 60_000;

const MAX_MOTIVATION = 5000;
const MAX_SKILLS = 1000;
const MAX_AVAILABILITY = 100;

type RecruitmentBody = Record<string, unknown>;

function parseRecruitmentBody(body: RecruitmentBody) {
  return {
    first_name: typeof body.first_name === 'string' ? body.first_name.trim() : '',
    last_name: typeof body.last_name === 'string' ? body.last_name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    // Honeypot: champ invisible pose par le client. Si rempli, c'est un bot.
    honey: typeof body.honey === 'string' ? body.honey.trim() : '',
    skills: typeof body.skills === 'string' ? body.skills.trim().slice(0, MAX_SKILLS) || null : null,
    availability:
      typeof body.availability === 'string'
        ? body.availability.trim().slice(0, MAX_AVAILABILITY) || null
        : null,
    motivation:
      typeof body.motivation === 'string'
        ? body.motivation.trim().slice(0, MAX_MOTIVATION) || null
        : null,
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
  // 1. Rate-limit IP avant tout parsing.
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = await rateLimitRoute(ip, '/api/recruitment', RECRUITMENT_LIMIT, RECRUITMENT_WINDOW_MS);
  if (blocked) return blocked;

  let body: RecruitmentBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { first_name, last_name, email, honey, skills, availability, motivation } =
    parseRecruitmentBody(body);

  // 2. Honeypot serveur: si rempli, on simule un succes pour ne pas confirmer le bot.
  if (honey !== '') {
    return new Response(
      JSON.stringify({ message: 'Candidature envoyée avec succès.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors = validateRecruitmentFields({ first_name, last_name, email });

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Dedup email pour eviter qu'un candidat soumette 10 fois la meme candidature.
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('recruitment_submissions')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ message: 'Candidature déjà enregistrée pour cet email.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { error } = await supabase
    .from('recruitment_submissions')
    .insert({ first_name, last_name, email, skills, availability, motivation });

  if (error) {
    return new Response(JSON.stringify({ message: "Erreur lors de l'enregistrement." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Candidature envoyée avec succès.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};