// src/pages/api/recruitment/reserve.ts
//
// Reservation d'une place de session par le membre lui-meme.
//
// POURQUOI UNE ROUTE DISTINCTE DE /api/recruitment
// ------------------------------------------------
// Les deux gestes n'ont ni le meme public ni les memes exigences. Candidater est
// ouvert a tous, anonymement, et demande un dossier (competences, motivation).
// Reserver une place suppose un compte, n'a besoin d'aucune saisie, et doit
// pouvoir etre refait (changer de session, annuler) sans que cela ressemble a
// une seconde candidature. Melanger les deux dans une route produisait le
// formulaire de six champs qu'on remplissait pour prendre un rendez-vous.
//
// MODELE
// ------
// Un compte n'a jamais qu'UNE candidature (index unique
// `uniq_recruitment_submission_per_user`). Reserver, c'est donc poser
// `session_id` sur cette ligne — la creer si elle n'existe pas encore. Annuler,
// c'est le remettre a NULL : la candidature survit, la place est rendue. Meme
// semantique que /api/admin/candidatures/unassign.

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { isValidUUID, MAX_NAME } from '@/lib/validation';
import { rateLimitRoute } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';
import { PUBLIC_SESSION_COLUMNS, getOwnSubmission } from '@/lib/recruitmentSessions';
import { notifySessionAssigned, notifySessionUnassigned } from '@/lib/recruitmentMail';
import type { RecruitmentSession, RecruitmentSubmission } from '@/types/recruitment';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * Plus permissif que /api/recruitment (5 / 10 min) : reserver, changer d'avis
 * puis annuler sont des gestes normaux et repetes, la ou candidater est
 * ponctuel. Reste assez bas pour qu'un script ne puisse pas balayer les places.
 */
const RESERVE_LIMIT = 10;
const RESERVE_WINDOW_MS = 10 * 60_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** L'interface de contexte n'est pas exportee par `@/lib/supabase` ; on la
 *  redérive plutot que d'en dupliquer une copie qui divergerait. */
type SupabaseContext = Parameters<typeof createSupabaseClient>[0];

/**
 * Identite du compte connecte, ou la `Response` d'erreur a renvoyer.
 * `getUser()` et jamais `getSession()` : le cookie de session est sous le
 * controle du client, seul l'appel au serveur Auth est non forgeable.
 */
async function requireAccount(context: SupabaseContext) {
  const { data: { user } } = await createSupabaseClient(context).auth.getUser();

  if (!user) {
    return json(
      { message: 'Connectez-vous pour réserver une place de session de recrutement.' },
      401,
    );
  }

  const email = user.email?.trim().toLowerCase() ?? '';
  if (!email) {
    // Compte sans email (connexion par telephone / provider exotique) : la
    // convocation n'aurait nulle part ou partir.
    return json(
      { message: "Votre compte n'a pas d'adresse email associée. Contactez-nous directement." },
      409,
    );
  }

  return { id: user.id, email };
}

/** « Marie Dupont » → prénom « Marie », nom « Dupont ». Les noms composés
 *  restent entiers du cote du nom de famille, jamais coupes au milieu. */
function splitFullName(fullName: string): { first_name: string; last_name: string } | null {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function readName(body: Record<string, unknown>): { first_name: string; last_name: string } | null {
  const first = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  const last = typeof body.last_name === 'string' ? body.last_name.trim() : '';
  if (!first || !last) return null;
  if (first.length > MAX_NAME || last.length > MAX_NAME) return null;
  return { first_name: first, last_name: last };
}

/**
 * POST — reserve une place, ou deplace la reservation existante vers une autre
 * session. Idempotent : re-poster la session deja reservee ne change rien.
 */
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = await rateLimitRoute(ip, '/api/recruitment/reserve', RESERVE_LIMIT, RESERVE_WINDOW_MS);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Corps de la requête invalide.' }, 400);
  }

  const account = await requireAccount({ request, cookies });
  if (account instanceof Response) return account;

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!isValidUUID(sessionId)) {
    return json({ message: 'Session sélectionnée invalide.' }, 422);
  }

  const admin = createSupabaseAdminClient();

  // 1. La session doit exister, etre ouverte et a venir. Une session passee
  //    reste `open` en base tant qu'un admin ne l'a pas cloturee : sans le
  //    filtre de date, on pourrait reserver une place pour hier.
  const { data: sessionRow, error: sessionError } = await admin
    .from('recruitment_sessions')
    .select(PUBLIC_SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('status', 'open')
    .gt('scheduled_at', new Date().toISOString())
    .maybeSingle();

  if (sessionError) {
    console.error('[api/recruitment/reserve] lecture session:', sessionError.code, sessionError.message);
    return json({ message: 'Erreur lors de la lecture de la session.' }, 500);
  }
  if (!sessionRow) {
    return json({ message: "Cette session n'est plus disponible." }, 400);
  }
  const session = sessionRow as unknown as RecruitmentSession;

  // 2. Identite. Trois sources, de la plus fiable a la plus couteuse pour le
  //    membre. La derniere seule lui demande de taper quelque chose.
  const own = await getOwnSubmission(account.id);
  let name = own ? { first_name: own.first_name, last_name: own.last_name } : null;

  if (!name) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', account.id)
      .maybeSingle();
    name = splitFullName((profile as { full_name: string | null } | null)?.full_name ?? '');
  }

  let nameCameFromBody = false;
  if (!name) {
    name = readName(body);
    nameCameFromBody = name !== null;
  }

  if (!name) {
    // Le client ouvre alors sa mini-modale a deux champs et rejoue le POST.
    return json(
      { needs_name: true, message: 'Indiquez votre prénom et votre nom pour réserver.' },
      422,
    );
  }

  // 3. Places restantes. On EXCLUT la ligne du demandeur : sans cela, un membre
  //    deja inscrit a une session complete ne pourrait plus la reconfirmer, et
  //    un deplacement compterait sa propre place contre le plafond.
  let placesQuery = admin
    .from('recruitment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .neq('status', 'declined');
  if (own) placesQuery = placesQuery.neq('id', own.id);

  const { count, error: countError } = await placesQuery;
  if (!countError && count != null && count >= session.max_candidates) {
    return json({ message: 'Cette session est complète.' }, 409);
  }

  // 4. Ecriture. UPDATE si le compte a deja une candidature, INSERT sinon.
  //    Le trigger `check_recruitment_session_capacity` reste l'autorite en cas
  //    de reservations simultanees : le comptage ci-dessus n'est qu'un filtre
  //    d'ergonomie, il ne serialise rien.
  const writeResult = own
    ? await admin
        .from('recruitment_submissions')
        .update({ session_id: sessionId, first_name: name.first_name, last_name: name.last_name })
        .eq('id', own.id)
        .select()
        .maybeSingle()
    : await admin
        .from('recruitment_submissions')
        .insert({
          first_name: name.first_name,
          last_name: name.last_name,
          email: account.email,
          session_id: sessionId,
          user_id: account.id,
        })
        .select()
        .maybeSingle();

  let submission = writeResult.data;
  const writeError = writeResult.error;

  if (writeError) {
    // 23505 = uniq_recruitment_submission_per_user : deux reservations
    // concurrentes du meme compte ont passe la lecture en meme temps. Ce n'est
    // pas une panne, l'autre requete a cree la ligne — on la met a jour.
    if (writeError.code === '23505') {
      const existing = await getOwnSubmission(account.id);
      if (existing) {
        const retry = await admin
          .from('recruitment_submissions')
          .update({ session_id: sessionId })
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        if (!retry.error && retry.data) {
          submission = retry.data;
        } else {
          console.error('[api/recruitment/reserve] reprise 23505:', retry.error?.code, retry.error?.message);
          return json({ message: 'Erreur lors de la réservation.' }, 500);
        }
      }
    } else if (writeError.code === '23514') {
      // 23514 = check_violation, l'ERRCODE que `check_recruitment_session_capacity`
      // leve pour « session pleine » comme pour « session fermee ». Le plafond a
      // ete atteint entre notre comptage et l'ecriture : le trigger a tranche,
      // et lui seul serialise vraiment (SELECT ... FOR UPDATE).
      return json({ message: "Cette session n'a plus de place disponible." }, 409);
    } else if (writeError.code === '23503') {
      // 23503 = foreign_key_violation : la session a disparu entre-temps.
      return json({ message: "Cette session n'est plus disponible." }, 400);
    } else {
      console.error('[api/recruitment/reserve] écriture:', writeError.code, writeError.message);
      return json({ message: 'Erreur lors de la réservation.' }, 500);
    }
  }

  if (!submission) {
    return json({ message: 'Erreur lors de la réservation.' }, 500);
  }

  // 5. Le nom saisi une fois est recopie dans le profil : on ne le redemandera
  //    plus, ici comme ailleurs.
  if (nameCameFromBody) {
    const { error: profileError } = await admin
      .from('profiles')
      .update({ full_name: `${name.first_name} ${name.last_name}` })
      .eq('id', account.id);
    if (profileError) {
      console.error('[api/recruitment/reserve] maj profil:', profileError.code, profileError.message);
    }
  }

  // Convocation. Un echec d'envoi ne doit pas annuler une place deja prise.
  if (own?.session_id !== sessionId) {
    try {
      await notifySessionAssigned(submission as unknown as RecruitmentSubmission, session);
    } catch (err) {
      console.error('[api/recruitment/reserve] email:', err);
    }
  }

  return json({ session_id: sessionId, message: 'Place réservée.' }, 200);
};

/** DELETE — annule la reservation. La candidature reste enregistree, seule la
 *  place est rendue : l'admin garde la trace du passage du membre. */
export const DELETE: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = getClientIp(request, clientAddress as string | undefined);
  const blocked = await rateLimitRoute(ip, '/api/recruitment/reserve', RESERVE_LIMIT, RESERVE_WINDOW_MS);
  if (blocked) return blocked;

  const account = await requireAccount({ request, cookies });
  if (account instanceof Response) return account;

  const own = await getOwnSubmission(account.id);
  if (!own || !own.session_id) {
    // Rien a annuler : l'etat voulu est deja atteint, ce n'est pas une erreur.
    return json({ session_id: null, message: 'Aucune réservation en cours.' }, 200);
  }

  const { data: updated, error } = await createSupabaseAdminClient()
    .from('recruitment_submissions')
    .update({ session_id: null })
    .eq('id', own.id)
    .select()
    .maybeSingle();

  if (error || !updated) {
    console.error('[api/recruitment/reserve] annulation:', error?.code, error?.message);
    return json({ message: "Erreur lors de l'annulation." }, 500);
  }

  try {
    await notifySessionUnassigned(updated as unknown as RecruitmentSubmission);
  } catch (err) {
    console.error('[api/recruitment/reserve] email annulation:', err);
  }

  return json({ session_id: null, message: 'Réservation annulée.' }, 200);
};
