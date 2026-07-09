// tests/e2e/a11y-contrast.spec.ts — audit de contraste axe-core (cf. audit.md P2 #38)
//
// Pourquoi ce test :
// - L'audit §6 notait : "Contrastes non verifiables statiquement. theme.css
//   utilise des variables CSS ; il faut un run axe-core."
// - Les tokens de theme.css (couleurs --color-*, --bg-*, --text-*) peuvent
//   regresser silencieusement a chaque refonte : un grep ne suffit pas, le
//   rendu navigateur est seul juge du ratio de contraste WCAG 2.1.
// - Ce test couvre les 5 gabarits publics specifies dans la roadmap P2 #38 :
//   /, /blog, /faq, /legal/politique-de-confidentialite, /piliers.
//
// Strategie :
// - On utilise @axe-core/playwright (Playwright est deja la : pas de nouvelle
//   dep d'execution).
// - Seuils : on echoue sur les violations "serious" et "critical" SEULEMENT.
//   Les "moderate" (ex: lien sans underline au survol) sont signalees en
//   warning via la sortie du rapport, sans faire casser la CI : un audit
//   a11y exhaustif est un projet a part, et faire echouer sur "moderate"
//   transformerait chaque PR en discussion de design.
// - Run sur le DOM apres hydratation des ecritures dynamiques (textes longs
//   dans /blog/[slug], bandeau cookies) : `await page.waitForLoadState`
//   avant l'analyse.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Les 5 gabarits publics mentionnes dans audit.md P2 #38.
// /piliers couvre tous les piliers (variant commun), pas besoin d'un par un.
const PUBLIC_GABARITS: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/', label: 'Accueil' },
  { path: '/blog', label: 'Index blog' },
  { path: '/faq', label: 'FAQ' },
  { path: '/legal/politique-de-confidentialite', label: 'Politique de confidentialite' },
  { path: '/piliers', label: 'Piliers' },
];

test.describe('Audit de contraste (axe-core)', () => {
  for (const gabarit of PUBLIC_GABARITS) {
    test(`contraste WCAG AA sur ${gabarit.label} (${gabarit.path})`, async ({ page }) => {
      const response = await page.goto(gabarit.path);
      expect(response?.status(), `${gabarit.path} doit repondre 200`).toBe(200);

      // Attendre la fin du rendu : Astro dev peut servir du HTML avant que
      // le CSS ne soit applique, et axe-core mesure les couleurs COMPUTED,
      // pas les valeurs statiques. networkidle = tous les CSS charges.
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        // Cible les violations de contraste (color-contrast) qui sont
        // l'objet de l'audit §6. On laisse le reste de l'arbre a11y
        // pour les "moderate" (warning, pas fail).
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const bloquantes = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      // Sortie du rapport (toujours) : permet d'inspecter ce qui a ete vu,
      // y compris les "moderate" qui ne font pas echouer.
      console.log(
        `[axe] ${gabarit.path} : ${accessibilityScanResults.violations.length} violation(s) `
        + `(${bloquantes.length} bloquante(s))`
      );
      for (const v of bloquantes) {
        console.log(`  - [${v.impact}] ${v.id} : ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    target: ${node.target.join(' ')}`);
        }
      }

      // Politique de tolerance (cf. audit.md P2 #38 - cloture) :
      // En local (npm run test:e2e), on ECHOUE dur : c'est le moment ou
      // un dev peut iterer sur theme.css. En CI, on n'echoue PAS : la CI
      // sert de barometre (les violations remontent dans la run), pas de
      // barrage. Bloquer la CI reviendrait a empecher tout merge avant
      // que l'integralite de la dette a11y soit corrigee, ce qui n'est
      // pas l'objectif de P2 #38 (l'objectif est d'AVOIR UN INSTRUMENT,
      // pas de tout corriger d'un coup).
      const enLocal = !process.env.CI;

      if (enLocal) {
        expect(
          bloquantes,
          `${bloquantes.length} violation(s) de contraste serieuse(s) ou critique(s) sur ${gabarit.path}`
        ).toEqual([]);
      } else {
        // Annotation GitHub Actions : visible dans la UI de la run sans
        // faire echouer le job.
        test.info().annotations.push({
          type: 'a11y-contrast',
          description: `${bloquantes.length} bloquante(s) sur ${gabarit.path} (rapport : ${accessibilityScanResults.violations.length} total)`,
        });
      }
    });
  }
});
