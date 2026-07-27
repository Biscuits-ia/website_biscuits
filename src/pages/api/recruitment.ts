// src/pages/api/recruitment.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_NAME, isValidUUID } from '@/lib/validation';
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
    session_id: typeof body.session_id === 'string' && body.session_id.trim() ? body.session_id.trim() : null,
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

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
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

  const { first_name, last_name, email, honey, skills, availability, motivation, session_id } =
    parseRecruitmentBody(body);

  // 2. Honeypot serveur: si rempli, on simule un succes pour ne pas confirmer le bot.
  if (honey !== '') {
    return new Response(
      JSON.stringify({ message: 'Candidature envoyée avec succès.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Identite, AVANT la validation : quand un compte est connecte c'est son
  //    adresse qui sera enregistree, donc c'est elle qu'il faut valider — pas
  //    celle du champ, qui n'est plus qu'une suggestion. getUser() (et jamais
  //    getSession()) : le cookie de session est sous le controle du client,
  //    seul l'appel au serveur Auth est non forgeable.
  const { data: { user } } = await createSupabaseClient({ request, cookies }).auth.getUser();

  // Email impose par le compte. Sans cela, un utilisateur connecte pouvait
  // reserver une place de session sous l'adresse d'un tiers. `user_id` scelle
  // le lien cote base (cf. migration 20260726160000).
  const accountEmail = user?.email?.trim().toLowerCase() ?? '';
  const effectiveEmail = accountEmail || email;
  const userId = user?.id ?? null;

  if (user && !accountEmail) {
    // Compte sans email (connexion par telephone / provider exotique) : on ne
    // peut rien imposer, on refuse plutot que d'enregistrer une adresse libre
    // en la faisant passer pour verifiee.
    return new Response(
      JSON.stringify({ message: "Votre compte n'a pas d'adresse email associée. Contactez-nous directement." }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors = validateRecruitmentFields({ first_name, last_name, email: effectiveEmail });

  if (session_id && !isValidUUID(session_id)) {
    errors.session_id = ['Session sélectionnée invalide.'];
  }

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ message: 'Erreur de validation.', errors }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. La candidature spontanee reste ouverte a tous ; le choix d'une SESSION
  //    est reserve aux comptes. C'est ici que la regle est appliquee : le
  //    formulaire ne fait que la refleter et peut etre contourne.
  if (session_id && !user) {
    return new Response(
      JSON.stringify({
        message: 'Connectez-vous pour candidater à une session de recrutement. Vous pouvez sinon envoyer une candidature spontanée.',
        errors: { session_id: ['Compte requis pour choisir une session.'] },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 5. Dedup pour eviter qu'un candidat soumette 10 fois la meme candidature.
  //    L'index unique partiel `uniq_recruitment_submission_per_user` tranche la
  //    course si deux requetes passent ce test en meme temps (cf. 23505 plus bas).
  //    Deux requetes plutot qu'un `.or()` : ce dernier demande d'interpoler les
  //    valeurs dans une chaine de filtre PostgREST, autant ne pas ouvrir cette
  //    surface pour une adresse email.
  const supabase = createSupabaseAdminClient();
  const { data: existingByEmail } = await supabase
    .from('recruitment_submissions')
    .select('id')
    .eq('email', effectiveEmail)
    .limit(1)
    .maybeSingle();

  // Couvre le cas d'un compte dont l'email a change depuis la candidature.
  let existingByUser = null;
  if (!existingByEmail && userId) {
    const { data } = await supabase
      .from('recruitment_submissions')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    existingByUser = data;
  }

  if (existingByEmail || existingByUser) {
    return new Response(
      JSON.stringify({ message: 'Candidature déjà enregistrée pour cet email.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 6. Vérifier la session sélectionnée (ouverte et non pleine)
  if (session_id) {
    // Colonnes listees une par une : cette lecture passe par le client
    // VISITEUR, dont les droits sont desormais restreints colonne par colonne
    // (migration 20260727151000). Un `select('*')` demanderait created_by et
    // partirait en 42501, cassant toute candidature rattachee a une session.
    const { data: session, error: sessionError } = await supabase
      .from('recruitment_sessions')
      .select('id, status, max_candidates')
      .eq('id', session_id)
      .eq('status', 'open')
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ message: 'La session sélectionnée n\'est pas disponible.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { count, error: countError } = await supabase
      .from('recruitment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)
      .neq('status', 'declined');

    if (!countError && count != null && count >= session.max_candidates) {
      return new Response(
        JSON.stringify({ message: 'La session sélectionnée est complète.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  const { error } = await supabase.from('recruitment_submissions').insert({
    first_name,
    last_name,
    email: effectiveEmail,
    skills,
    availability,
    motivation,
    session_id,
    user_id: userId,
  });

  if (error) {
    // 23505 = uniq_recruitment_submission_per_user : deux soumissions
    // concurrentes du meme compte ont passe le dedoublonnage en meme temps.
    // Meme reponse que le dedoublonnage : ce n'est pas une panne.
    if (error.code === '23505') {
      return new Response(
        JSON.stringify({ message: 'Candidature déjà enregistrée pour cet email.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.error('[api/recruitment] insert error:', error.code, error.message);
    return new Response(JSON.stringify({ message: "Erreur lors de l'enregistrement." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // `email` est renvoye : c'est celui du compte quand l'utilisateur est
  // connecte, donc pas forcement celui qu'il a tape. L'ecran de confirmation
  // doit afficher l'adresse reellement enregistree.
  return new Response(
    JSON.stringify({ message: 'Candidature envoyée avec succès.', email: effectiveEmail }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};