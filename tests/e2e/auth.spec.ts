// tests/e2e/auth.spec.ts — tests E2E des parcours d'authentification (P4 #34)
//
// Ce que ces tests exercent :
// 1. La page de connexion se charge et presente le formulaire attendu.
// 2. Une route protegee redirige vers /connexion si on n'est pas authentifie.
// 3. Une soumission avec credentials invalides affiche un message d'erreur
//    (et NE REDIRIGE PAS vers le dashboard).
//
// Pourquoi ces 3 tests et pas davantage :
// - Ils exercent le chemin de guard d'auth sans avoir besoin d'un
//   Supabase de test, donc ils peuvent tourner sur la machine de n'importe
//   quel developpeur ou en CI sans setup.
// - Le scenario "credentials valides -> dashboard" necessiterait un
//   compte de test dedie et une base isolee : c'est un commit ulterieur.
//
// Reentrancia P4 #44 : l'item #44 precisait que /dashboard/user etait
// blanc a cause d'un ReferenceError sur Astro.locals dans les composants.
// Le test 2 verifie que la garde marche (redirect 302) -- le crash blanc
// precedent aurait produit un timeout, pas un redirect.

import { test, expect } from '@playwright/test';

test.describe('Authentification', () => {
  test('la page /connexion se charge et presente le formulaire', async ({ page }) => {
    await page.goto('/connexion');

    await expect(page).toHaveTitle(/Connexion/i);
    await expect(page.getByLabel(/Adresse email/i)).toBeVisible();
    await expect(page.getByLabel(/Mot de passe/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Se connecter/i })).toBeVisible();
  });

  test('une route protegee redirige vers /connexion quand non authentifie', async ({ page }) => {
    const response = await page.goto('/dashboard/user', { waitUntil: 'domcontentloaded' });

    // Astro.redirect() renvoie un 302 puis le navigateur suit. L'URL finale
    // doit etre /connexion (ou /connexion/ selon la config trailingSlash).
    await expect(page).toHaveURL(/\/connexion\/?$/);

    // La reponse initiale peut etre 302 (redirect) ou 200 si Astro a
    // deja fait le redirect en middleware cote serveur.
    expect(response, 'une reponse a ete obtenue').not.toBeNull();
  });

  test('une connexion avec credentials invalides affiche une erreur', async ({ page }) => {
    await page.goto('/connexion');

    await page.getByLabel(/Adresse email/i).fill('nexistepas@biscuits-ia.test');
    await page.getByLabel(/Mot de passe/i).fill('mauvais-mot-de-passe-12345');
    await page.getByRole('button', { name: /Se connecter/i }).click();

    // On attend soit un message d'erreur visible, soit qu'on est toujours
    // sur /connexion (donc pas de redirect vers dashboard).
    await expect(page).toHaveURL(/\/connexion\/?$/);

    // Le DOM doit contenir un message d'erreur (role=alert). On cherche
    // #msg (l'ID utilise par la page de connexion) ou tout role=alert.
    const errorMessage = page.locator('#msg, [role="alert"]').first();
    await expect(errorMessage).toBeVisible({ timeout: 5_000 });
  });

  // Tout le tunnel d'auth partageait le meme `<div id="msg" hidden>` pilote par
  // `style.display`. La regle agent-utilisateur du HTML etant
  // `[hidden] { display: none !important }`, et un !important d'agent battant un
  // style inline, AUCUN message d'erreur ne s'affichait nulle part : le texte
  // etait bien ecrit dans un element reste `display: none`. Ces cas exercent la
  // validation cote client (champs vides), sans backend ni compte de test.
  const pagesAvecMessage = [
    { url: '/inscription', bouton: '#signup-btn' },
    { url: '/mot-de-passe-oublie', bouton: '#reset-btn' },
  ];

  for (const { url, bouton } of pagesAvecMessage) {
    test(`${url} affiche son message de validation`, async ({ page }) => {
      await page.goto(url);
      await page.locator(bouton).click();

      const message = page.locator('#msg');
      await expect(message).toBeVisible({ timeout: 5_000 });
      await expect(message).not.toBeEmpty();
    });
  }
});
