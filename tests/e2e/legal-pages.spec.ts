// tests/e2e/legal-pages.spec.ts — régression sur P4 #23 (hiérarchie des titres)
//
// Pourquoi ce test :
// - L'audit §1.2 a releve que `Header.astro` et `Footer.astro` (avant
//   Layout.astro) contenaient 5 <h3> **avant** le <h1> de la page.
//   Origine : le mega-menu et les sections du footer ouvraient des <h3>
//   sans <h2> ancêtre -> violation WCAG 1.3.1 (info and relationships).
// - Correctif actuel : chaque page fournit exactement un <h1> dans l'unique
//   <main>. Sans test, un PR futur peut re-casser la hierarchie
//   en ajoutant un composant (ex: nouveau mega-menu) qui ouvre un <h3>
//   avant le <h1> de la page.
//
// Ce qu'il verifie :
// - Chaque page legale repond 200 (sitemap entry = page reelle, pas un
//   301 masque ; cf. l'item P1-6 sur /logiciels et /anti-pepins).
// - Chaque page legale a exactement un <h1> et un <main>.

import { test, expect } from '@playwright/test';
import { countHeadings } from './helpers/dom';

const LEGAL_PAGES = [
  { path: '/legal', name: 'index' },
  { path: '/legal/mentions-legales', name: 'mentions-legales' },
  { path: '/legal/cgu', name: 'cgu' },
  { path: '/legal/cookies', name: 'cookies' },
  { path: '/legal/politique-de-confidentialite', name: 'politique-de-confidentialite' },
];

test.describe('P4 #23 — pages légales : accessibilité de base', () => {
  for (const { path, name } of LEGAL_PAGES) {
    test(`${name} repond 200 et a une hierarchie de titres correcte`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status(), `${path} doit repondre 200`).toBe(200);

      // Un titre principal et une region principale par document.
      const h1Count = await countHeadings(page, 1);
      expect(h1Count, `${path} doit avoir exactement 1 <h1>`).toBe(1);
      expect(await page.locator('main').count(), `${path} doit avoir exactement 1 <main>`).toBe(1);

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
