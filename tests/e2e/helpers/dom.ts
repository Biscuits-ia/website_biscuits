// tests/e2e/helpers/dom.ts — utilitaires de mesure DOM pour les tests E2E
//
// Pourquoi ce fichier :
// - Astro dev injecte un overlay DevTools (#astro-dev-toolbar) qui
//   pollue les mesures : il contient ses propres <h1>, <h2>, <h3> et
//   <button>. Les tests qui comptent ou cherchent des elements dans
//   la page voient l'union page + overlay.
// - En production, l'overlay n'existe pas -> les helpers retournent
//   inconditionnellement ce qu'on cherche. En dev, l'overlay est
//   simplement exclu.
//
// Strategie de filtrage : Playwright `locator.filter()` ne supporte
// pas directement "exclure les elements qui sont dans X". On utilise
// donc `.evaluateAll` sur les Locators pour faire le tri en JS : on
// recupere tous les <hN>, on demande a chaque element s'il est
// dans le sous-arbre de #astro-dev-toolbar, et on garde les autres.

import type { Page } from '@playwright/test';

/**
 * Compte les <hN> de la page en excluant tout ce qui est dans
 * #astro-dev-toolbar (l'overlay DevTools d'Astro, present en dev).
 *
 * Renvoie un nombre. Equivalent a `await page.locator('hN').count()`
 * en production.
 */
export async function countHeadings(page: Page, level: 1 | 2 | 3): Promise<number> {
  return page.evaluate((lvl) => {
    const all = document.querySelectorAll(`h${lvl}`);
    const toolbar = document.getElementById('astro-dev-toolbar');
    if (!toolbar) return all.length;
    let count = 0;
    for (const el of all) {
      // .contains() renvoie true si l'element est le toolbar lui-meme
      // OU un de ses descendants. Dans les deux cas, on l'exclut.
      if (!toolbar.contains(el)) count++;
    }
    return count;
  }, level);
}
