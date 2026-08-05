// tests/e2e/legal-redirection.spec.ts — régression sur P4 #28
//
// Pourquoi ce test :
// - L'item P4 #28 a supprime src/pages/legal/confidentialite.astro (161 l.,
//   obsolète) et ajoute une 301 dans vercel.json vers la canonique
//   /legal/politique-de-confidentialite.
// - En local, astro dev ne lit PAS vercel.json : la 301 n'existe
//   qu'en production (Vercel). Le test "GET /legal/confidentialite -> 301"
//   est donc skip en local (`test.skip(!process.env.CI, ...)`). C'est
//   assumé : le but est de verrouiller la 301 **en prod**, pas en dev.
// - Le risque de reintroduction de la page source (qui rendrait la 301
//   inutile) est couvert par le test "le sitemap ne reference pas
//   l'ancienne URL", qui lui tourne en local ET en CI.
//
// Ce qu'il verifie :
// - En CI (prod) : GET /legal/confidentialite -> 301, Location
//   = /legal/politique-de-confidentialite.
// - En local + CI : le sitemap dynamique (genere par @astrojs/sitemap)
//   ne reference plus /legal/confidentialite (sinon, double indexation).
// - En local + CI : la page canonique existe et a un <h1>.
//
// Effet de bord recherche :
// - Un PR futur reintroduit src/pages/legal/confidentialite.astro -> le
//   test sitemap echoue (verrou de surface).
// - Un PR futur retire la 301 de vercel.json -> le test 301 echoue en
//   CI (verrou de redirection).

import { test, expect } from '@playwright/test';
import { countHeadings } from './helpers/dom';

const IS_CI = !!process.env.CI;

test.describe('P4 #28 — redirection page légale', () => {
  test("le sitemap ne reference pas l'ancienne URL", async ({ request }) => {
    // @astrojs/sitemap genere sitemap-index.xml qui pointe sur
    // sitemap-0.xml. On suit le redirect logique : charger l'index,
    // puis le fichier reference.
    //
    // ATTENTION : le sitemap n'est genere qu'au BUILD (par
    // @astrojs/sitemap), pas par astro dev. Ce test n'a donc de
    // sens qu'en CI (apres `astro build` + `astro preview`) ou en
    // local apres un build manuel. En dev, le sitemap n'existe pas.
    test.skip(!process.env.CI, 'sitemap : genere au build seulement, skip en dev');

    const indexResponse = await request.get('/sitemap-index.xml');
    expect(indexResponse.status()).toBe(200);

    const indexXml = await indexResponse.text();
    // L'index liste les fichiers sitemap-*.xml. On prend le premier
    // (le projet n'en a qu'un en general).
    const sitemapFile = indexXml.match(/<loc>(.*?sitemap-\d+\.xml)<\/loc>/)?.[1];
    expect(sitemapFile, 'sitemap-index.xml doit referencer un fichier sitemap').toBeTruthy();

    const sitemapResponse = await request.get(sitemapFile!);
    expect(sitemapResponse.status()).toBe(200);
    const sitemapXml = await sitemapResponse.text();

    // Aucune URL ne doit finir par /legal/confidentialite (avec ou sans
    // slash). Si l'ancienne page reapparait, elle sera listee ici.
    expect(sitemapXml, 'sitemap-0 ne doit pas contenir /legal/confidentialite').not.toMatch(
      /\/legal\/confidentialite\b/
    );

    // La canonique DOIT etre dans le sitemap.
    expect(sitemapXml, 'sitemap-0 doit contenir la canonique').toMatch(
      /\/legal\/politique-de-confidentialite\b/
    );
  });

  test('la page canonique existe et a un <h1>', async ({ page }) => {
    // Sanity check : si la 301 pointe sur une 404 en prod, ce test
    // echoue aussi.
    const response = await page.goto('/legal/politique-de-confidentialite', {
      waitUntil: 'networkidle',
    });
    expect(response?.status(), 'la canonique doit repondre 200').toBe(200);

    // 1 seul h1 visible (le h1 global du layout est visuellement cache).
    // countHeadings exclut l'overlay Astro DevTools (cf. helpers/dom.ts).
    const h1Count = await countHeadings(page, 1);
    expect(h1Count, 'la page doit avoir entre 1 et 2 <h1>').toBeGreaterThanOrEqual(1);
    expect(h1Count, 'la page doit avoir entre 1 et 2 <h1>').toBeLessThanOrEqual(2);
  });

  // CE TEST NE S'EXECUTE QU'EN CI.
  //
  // Pourquoi : la 301 est dans vercel.json, lu uniquement par Vercel en
  // production. astro dev (utilise en local) sert directement le fichier
  // source ; comme la page source est supprimee, GET /legal/confidentialite
  // -> 404 en local, pas 301. Le test serait faux negatif.
  //
  // Pour l'executer en local : demarrer `astro preview` APRES un build
  // -- mais preview ne lit pas non plus vercel.json (les redirects sont
  // au niveau du CDN, pas de l'app). Conclusion : ce test n'a de sens
  // que contre la prod.
  test('GET /legal/confidentialite redirige en 301 vers la canonique', async ({ request }) => {
    test.skip(!IS_CI, '301 Vercel : test reservé a la CI (vercel.json non lu en local)');

    const response = await request.get('/legal/confidentialite', {
      maxRedirects: 0,
    });

    expect(response.status(), 'le status doit etre 301 (Moved Permanently)').toBe(301);

    const location = response.headers()['location'];
    expect(location, 'Location doit pointer sur la canonique').toBe(
      '/legal/politique-de-confidentialite'
    );
  });

  test('GET /legal/confidentialite/ (avec slash) redirige aussi', async ({ request }) => {
    test.skip(!IS_CI, '301 Vercel : test reservé a la CI (vercel.json non lu en local)');

    // Astro genere par defaut des URLs avec trailing slash. La 301 doit
    // fonctionner dans les deux formes.
    const response = await request.get('/legal/confidentialite/', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(301);
    expect(response.headers()['location']).toBe('/legal/politique-de-confidentialite');
  });
});
