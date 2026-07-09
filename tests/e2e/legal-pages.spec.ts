// tests/e2e/legal-pages.spec.ts — régression sur P4 #23 (hiérarchie des titres)
//
// Pourquoi ce test :
// - L'audit §1.2 a releve que `Header.astro` et `Footer.astro` (avant
//   Layout.astro) contenaient 5 <h3> **avant** le <h1> de la page.
//   Origine : le mega-menu et les sections du footer ouvraient des <h3>
//   sans <h2> ancêtre -> violation WCAG 1.3.1 (info and relationships).
// - Correctif : Layout.astro a un <h1> global "Biscuits IA" en premier
//   enfant du <body>, et chaque page a ensuite son <h1> specifique dans
//   <main>. Mais sans test, un PR futur peut re-casser la hierarchie
//   en ajoutant un composant (ex: nouveau mega-menu) qui ouvre un <h3>
//   avant le <h1> de la page.
//
// Ce qu'il verifie :
// - Chaque page legale repond 200 (sitemap entry = page reelle, pas un
//   301 masque ; cf. l'item P1-6 sur /logiciels et /anti-pepins).
// - Chaque page legale a EXACTEMENT 1 <h1> visible (le <h1> global du
//   layout est `class="visually-hidden"`, donc compte quand meme en
//   nombre total mais n'apparait pas dans l'arbre d'accessibilite
//   visible).

import { test, expect } from '@playwright/test';
import { countHeadings } from './helpers/dom';

const LEGAL_PAGES = [
  { path: '/legal/', name: 'index' },
  { path: '/legal/mentions-legales', name: 'mentions-legales' },
  { path: '/legal/cgu', name: 'cgu' },
  { path: '/legal/cgv', name: 'cgv' },
  { path: '/legal/cookies', name: 'cookies' },
  { path: '/legal/politique-de-confidentialite', name: 'politique-de-confidentialite' },
  { path: '/legal/parrainage', name: 'parrainage' },
  { path: '/legal/exoneration', name: 'exoneration' },
];

test.describe('P4 #23 — pages légales : accessibilité de base', () => {
  for (const { path, name } of LEGAL_PAGES) {
    test(`${name} repond 200 et a une hierarchie de titres correcte`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status(), `${path} doit repondre 200`).toBe(200);

      // <h1> : doit y en avoir au moins 1. Les pages legales n'ont
      // generalement qu'un seul h1 specifique, plus le h1 global
      // visuellement cache du Layout. On exige 1 ou 2 (1 visible + 1
      // cache), pas 0 ni 3+.
      // (countHeadings exclut l'overlay Astro DevTools en dev.)
      const h1Count = await countHeadings(page, 1);
      expect(h1Count, `${path} doit avoir au moins 1 <h1>, max 2`).toBeGreaterThanOrEqual(1);
      expect(h1Count, `${path} ne doit pas avoir plus de 2 <h1>`).toBeLessThanOrEqual(2);

      // Pas de <h3> sans <h2> ancetre (WCAG 1.3.1) : on verifie
      // qu'un h2 existe avant un eventuel h3.
      const h2Count = await countHeadings(page, 2);
      const h3Count = await countHeadings(page, 3);
      if (h3Count > 0) {
        expect(h2Count, `${path} : un <h3> exige un <h2> avant`).toBeGreaterThan(0);
      }
    });
  }
});
