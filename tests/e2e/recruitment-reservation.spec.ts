// tests/e2e/recruitment-reservation.spec.ts — /rejoignez-nous : reserver, pas candidater
//
// Pourquoi ce test :
// - Une session de recrutement est un rendez-vous a places limitees. Le mot
//   « Candidater » sur ses cartes a fait croire pendant des semaines qu'il
//   fallait deposer un dossier pour prendre une place, et ouvrait un formulaire
//   de six champs a un membre dont le site connaissait deja l'identite.
// - Le radiogroup de sessions du formulaire du bas offrait un SECOND chemin vers
//   la meme place. C'est cette dualite qui a produit le bug du 26/07 (la
//   candidature partait sans la session choisie). Le test verrouille sa
//   disparition : le jour ou quelqu'un le remet, il tombe.
//
// Ce qu'il verifie :
// - la page repond 200 (elle a deja rendu 500 en production le 27/07) ;
// - aucun bouton de session ne dit « Candidater » ;
// - une carte non pleine propose « Réserver ma place », une carte pleine est
//   desactivee ;
// - le formulaire du bas n'offre plus de choix de session ;
// - un visiteur non connecte qui clique est envoye vers /connexion.
//
// Les assertions sur les cartes ne s'executent que s'il y a des sessions
// ouvertes : le jeu de donnees local n'en garantit aucune, et un test qui exige
// une session absente mesurerait la base, pas le code.

import { test, expect } from '@playwright/test';

test.describe('/rejoignez-nous — reservation de place', () => {
  test('la page se charge et parle de reservation, pas de candidature', async ({ page }) => {
    const response = await page.goto('/rejoignez-nous');
    expect(response?.status(), 'la page doit rendre, pas planter').toBe(200);

    await expect(page.getByRole('heading', { name: /sessions de recrutement/i })).toBeVisible();

    // Le mot « Candidater » ne doit plus figurer sur AUCUN bouton de session.
    // Il reste legitime ailleurs (FAQ, lien jeveuxaider), d'ou le filtre.
    const sessionsSection = page.locator('#sessions');
    await expect(sessionsSection.getByRole('button', { name: /candidater/i })).toHaveCount(0);
  });

  test('les cartes de session proposent de reserver, une carte pleine est desactivee', async ({ page }) => {
    await page.goto('/rejoignez-nous');

    const cards = page.locator('.recruit-sessions__card');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'aucune session ouverte dans ce jeu de donnees');

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const button = card.locator('button').first();
      const label = (await button.textContent())?.trim() ?? '';

      if (label === 'Complet') {
        await expect(button).toBeDisabled();
      } else {
        // Reserver sa place, annuler la sienne : les deux seuls gestes offerts.
        expect(label).toMatch(/réserver ma place|annuler ma réservation/i);
      }
    }
  });

  test('le formulaire du bas n\'offre plus de choix de session', async ({ page }) => {
    await page.goto('/rejoignez-nous');

    // L'ilot React est monte en `client:load` : on attend un de ses champs
    // plutot qu'un timeout arbitraire.
    await expect(page.locator('#page-prenom')).toBeVisible();

    // Un seul chemin vers une session : les cartes. Le radiogroup a disparu.
    await expect(page.locator('.session-options')).toHaveCount(0);
    await expect(page.locator('input[name="session_id"]')).toHaveCount(0);
  });

  test('un visiteur non connecte est envoye vers la connexion', async ({ page }) => {
    await page.goto('/rejoignez-nous');

    const reserveButton = page.locator('button.js-reserve:not([disabled])').first();
    test.skip((await reserveButton.count()) === 0, 'aucune session reservable dans ce jeu de donnees');

    await reserveButton.click();
    await page.waitForURL(/\/connexion/);
    expect(new URL(page.url()).searchParams.get('message')).toBe('reserver');
  });
});
