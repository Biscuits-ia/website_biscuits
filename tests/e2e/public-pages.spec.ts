// tests/e2e/public-pages.spec.ts — pages publiques : 404, mots de passe, inscription
//
// Pourquoi ce test :
// - La 404 (src/pages/404.astro) est la derniere barriere entre un
//   visiteur perdu et une page d'erreur Vercel generique. Si elle
//   disparait (refonte, fichier renomme) ou si elle n'a plus de <h1>,
//   le visiteur n'a aucun repere. Un backlink externe vers une URL
//   obsolete arrive ici -> c'est la qu'on le retient.
// - /mot-de-passe-oublie et /inscription : un bug sur l'une de ces
//   deux pages = zero nouveaux utilisateurs OU utilisateurs bloques.
//   Elles meritent un test de smoke (la page se charge, le formulaire
//   est la) parce qu'un build reussi ne garantit pas qu'elles rendent
//   (cf. P4 #44 : /dashboard/user blanchissait alors que le build
//   passait).
//
// Ce qu'il verifie :
// - 404 : repond 404, contient un <h1>, contient un lien de retour.
// - /mot-de-passe-oublie : repond 200, contient un champ email et un
//   bouton de soumission.
// - /inscription : repond 200, contient un champ email et un bouton
//   d'inscription.

import { test, expect } from '@playwright/test';

test.describe('Pages publiques critiques', () => {
  test('la page 404 sert un 404 et propose un retour', async ({ page }) => {
    // Une URL inconnue doit declencher la 404 d'Astro.
    const response = await page.goto('/url-qui-nexiste-pas-12345');
    expect(response?.status(), 'une URL inconnue doit repondre 404').toBe(404);

    // 1 <h1> minimum (un visiteur perdu doit avoir un titre clair).
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();

    // Au moins un lien vers l'accueil (ne pas laisser le visiteur bloque).
    const homeLink = page.getByRole('link', { name: /accueil|retour|home/i }).first();
    await expect(homeLink).toBeVisible();
  });

  test('/mot-de-passe-oublie se charge et presente le formulaire', async ({ page }) => {
    const response = await page.goto('/mot-de-passe-oublie');
    expect(response?.status()).toBe(200);

    // Un champ email et un bouton de soumission : c'est le minimum
    // pour qu'un utilisateur bloque puisse demander un lien de reset.
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /envoyer|reinitialiser|recevoir/i })
    ).toBeVisible();
  });

  test('/inscription se charge et presente le formulaire', async ({ page }) => {
    const response = await page.goto('/inscription');
    expect(response?.status()).toBe(200);

    // Meme minimum : email + bouton. Le reste du formulaire (mot de
    // passe, organisation...) peut evoluer sans casser le test.
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /inscrire|inscription|compte|cr[eé]er/i })
    ).toBeVisible();
  });
});
