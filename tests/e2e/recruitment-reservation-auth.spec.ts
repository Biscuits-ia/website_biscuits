// tests/e2e/recruitment-reservation-auth.spec.ts — parcours de reservation connecte
//
// GARDE-FOU : ces tests ecrivent dans la base Supabase pointee par `.env`. Ils
// sont donc IGNORES par defaut et ne s'executent qu'avec :
//
//   E2E_AUTH=1 npx playwright test tests/e2e/recruitment-reservation-auth.spec.ts
//
// Ce qu'ils fabriquent, ils le detruisent : un compte jetable, deux sessions
// jetables creees par ce compte, et les emails que la reservation met en file.
// Aucune session reelle n'est touchee — le test ne reserve que sur les siennes.
// Le nettoyage s'appuie sur les cascades du schema : `recruitment_sessions
// .created_by` et `recruitment_submissions.user_id` sont tous deux
// ON DELETE CASCADE depuis `auth.users`, donc supprimer le compte emporte ses
// sessions et sa candidature. Seul `email_outbox` demande une purge explicite,
// sa ligne n'ayant aucun lien de cle etrangere vers le compte.
//
// Ce qu'ils verifient — le chemin que les tests anonymes ne peuvent pas voir :
// 1. reserver pose la place et l'ecran le refletent apres rechargement ;
// 2. reserver ailleurs DEPLACE la candidature (une seule ligne, place liberee) ;
// 3. annuler rend la place SANS supprimer la candidature.

import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './helpers/supabase-admin';

const AUTH_TESTS_ACTIFS = process.env.E2E_AUTH === '1';

// Suffixe unique : deux runs concurrents ne doivent pas se marcher dessus.
const MARQUEUR = `e2e-reservation-${Date.now()}`;
const EMAIL = `${MARQUEUR}@biscuits-ia.test`;
const MOT_DE_PASSE = 'MotDePasseE2E!2026';
const NOM_COMPLET = 'Marie Dupont';

let admin: SupabaseClient;
let userId = '';
let sessionAId = '';
let sessionBId = '';

/** Date a venir : /rejoignez-nous et /api/recruitment/reserve filtrent tous
 *  deux sur `scheduled_at > now()`. */
function dansNJours(n: number): string {
  return new Date(Date.now() + n * 24 * 3600_000).toISOString();
}

test.describe.serial('/rejoignez-nous — reservation connectee', () => {
  test.skip(!AUTH_TESTS_ACTIFS, 'ecrit en base : activer avec E2E_AUTH=1');

  test.beforeAll(async () => {
    // Garde repetee dans le hook : selon les versions, Playwright execute les
    // hooks d'un groupe meme quand ses tests sont ignores. Sans cela, un simple
    // `npx playwright test` creerait un compte sans jamais jouer de test.
    if (!AUTH_TESTS_ACTIFS) return;

    admin = createAdminClient();

    // `email_confirm: true` : sans cela la connexion echoue et tous les tests
    // tombent sur un symptome (page de connexion) sans rapport avec le sujet.
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: MOT_DE_PASSE,
      email_confirm: true,
      user_metadata: { full_name: NOM_COMPLET },
    });
    if (userError || !created.user) {
      throw new Error(`[e2e] création du compte impossible : ${userError?.message}`);
    }
    userId = created.user.id;

    // Le trigger `handle_new_user` cree le profil, mais il lit
    // `raw_user_meta_data->>'full_name'` : on s'assure du nom, c'est lui qui
    // permet la reservation en un clic sans passer par la modale.
    await admin.from('profiles').update({ full_name: NOM_COMPLET }).eq('id', userId);

    const { data: sessions, error: sessionError } = await admin
      .from('recruitment_sessions')
      .insert([
        {
          title: `${MARQUEUR} — session A`,
          scheduled_at: dansNJours(14),
          duration_minutes: 90,
          location: 'Visio (test)',
          max_candidates: 2,
          status: 'open',
          created_by: userId,
        },
        {
          title: `${MARQUEUR} — session B`,
          scheduled_at: dansNJours(21),
          duration_minutes: 90,
          location: 'Visio (test)',
          max_candidates: 2,
          status: 'open',
          created_by: userId,
        },
      ])
      // `scheduled_at` fait partie de la projection ET le tri se fait en JS :
      // un `.order()` PostgREST sur un `insert().select()` porte sur les seules
      // colonnes retournees, et echouait par « column ... does not exist ».
      .select('id, title, scheduled_at');

    if (sessionError || !sessions || sessions.length !== 2) {
      throw new Error(`[e2e] création des sessions impossible : ${sessionError?.message}`);
    }

    const triees = [...sessions].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    sessionAId = triees[0].id;
    sessionBId = triees[1].id;
  });

  test.afterAll(async () => {
    if (!AUTH_TESTS_ACTIFS || !admin) return;

    // Les emails d'abord : leur ligne ne porte aucune cle etrangere vers le
    // compte, la cascade ne les emporterait pas et le cron les enverrait.
    await admin.from('email_outbox').delete().eq('to_email', EMAIL);

    // Puis le compte : la cascade emporte sa candidature et ses deux sessions.
    if (userId) await admin.auth.admin.deleteUser(userId);

    // Ceinture et bretelles : si une cascade avait change, on ne veut pas
    // laisser deux sessions de test visibles sur la page publique.
    await admin.from('recruitment_sessions').delete().like('title', `${MARQUEUR}%`);
  });

  /** Connexion par l'interface, comme un vrai membre. */
  async function seConnecter(page: import('@playwright/test').Page) {
    await page.goto('/connexion?redirect=/rejoignez-nous');
    await page.getByLabel(/Adresse email/i).fill(EMAIL);
    await page.getByLabel(/Mot de passe/i).fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: /Se connecter/i }).click();
    await page.waitForURL(/\/rejoignez-nous/);
  }

  /** Carte d'une session donnee, identifiee par l'attribut pose par la page. */
  function carte(page: import('@playwright/test').Page, sessionId: string) {
    return page.locator(`.recruit-sessions__card[data-session-id="${sessionId}"]`);
  }

  /** La candidature du compte, telle qu'elle existe reellement en base. */
  async function candidatureEnBase() {
    const { data } = await admin
      .from('recruitment_submissions')
      .select('id, session_id, first_name, last_name, email')
      .eq('user_id', userId);
    return data ?? [];
  }

  test('réserver pose la place et l\'écran la reflète', async ({ page }) => {
    await seConnecter(page);

    await carte(page, sessionAId).getByRole('button', { name: /Réserver ma place/i }).click();

    // La page recharge : l'etat vient du serveur, pas du client.
    await expect(carte(page, sessionAId).getByText(/Place réservée/i)).toBeVisible();
    await expect(
      carte(page, sessionAId).getByRole('button', { name: /Annuler ma réservation/i }),
    ).toBeVisible();

    const lignes = await candidatureEnBase();
    expect(lignes, 'une seule candidature par compte').toHaveLength(1);
    expect(lignes[0].session_id).toBe(sessionAId);
    // Le nom vient du profil : aucune saisie n'a ete demandee.
    expect(`${lignes[0].first_name} ${lignes[0].last_name}`).toBe(NOM_COMPLET);
    expect(lignes[0].email).toBe(EMAIL);
  });

  test('réserver une autre session déplace la place au lieu d\'en créer une seconde', async ({ page }) => {
    await seConnecter(page);

    // Le deplacement demande confirmation : la place precedente est perdue.
    page.on('dialog', (dialog) => dialog.accept());

    await carte(page, sessionBId).getByRole('button', { name: /Réserver ma place/i }).click();

    await expect(carte(page, sessionBId).getByText(/Place réservée/i)).toBeVisible();
    await expect(
      carte(page, sessionAId).getByRole('button', { name: /Réserver ma place/i }),
    ).toBeVisible();

    const lignes = await candidatureEnBase();
    expect(lignes, 'toujours une seule candidature').toHaveLength(1);
    expect(lignes[0].session_id).toBe(sessionBId);
  });

  test('annuler rend la place sans supprimer la candidature', async ({ page }) => {
    await seConnecter(page);

    page.on('dialog', (dialog) => dialog.accept());

    await carte(page, sessionBId).getByRole('button', { name: /Annuler ma réservation/i }).click();

    await expect(
      carte(page, sessionBId).getByRole('button', { name: /Réserver ma place/i }),
    ).toBeVisible();

    const lignes = await candidatureEnBase();
    expect(lignes, 'la candidature survit à l\'annulation').toHaveLength(1);
    expect(lignes[0].session_id).toBeNull();
  });
});
