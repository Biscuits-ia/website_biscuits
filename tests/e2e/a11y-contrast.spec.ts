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
// - Seuils : on s'interesse aux violations "serious" et "critical". Les
//   "moderate" (ex: lien sans underline au survol) ne sont pas signalees ici :
//   l'audit a11y exhaustif est un autre chantier.
// - Run sur le DOM apres hydratation : `await page.waitForLoadState('networkidle')`
//   avant l'analyse.
//
// Politique de tolerance (cf. audit.md P2 #38 - cloture) :
// - Local (`npm run test:e2e`, CI absent) : ECHOUE dur des la premiere
//   violation. C'est le mode "dev" : tu sais immediatement ce que ta PR casse.
// - CI (process.env.CI defini) : ne fail PAS. Les violations sont annotees
//   dans la run, visibles dans l'UI GitHub Actions. Raison : faire echouer
//   la CI sur la dette a11y existante empecherait tout merge. L'instrument
//   sert de barometre, pas de barrage. La migration "fail dur en CI" est un
//   item de suivi, declenche quand theme.css est conforme.
//
// Limitation runtime (CI seulement) :
// - astro preview ne fonctionne pas avec l'adaptateur Vercel (cf. .github/
//   workflows/ci.yml, job a11y-contrast). Le job CI sert donc le build
//   statique via un serveur HTTP minimal demarre dans le step precedent.
//   Le spec s'appuie sur PLAYWRIGHT_BASE_URL, configurable par l'orchestrateur.

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

      // Puis attendre la fin des animations d'entree. Le hero fait apparaitre
      // ses elements en fondu (`opacity-0` + `animate-fadeInUp/Right`, cf.
      // Hero.astro) : axe mesure la couleur COMPOSITE, donc un texte saisi a
      // mi-fondu est rapporte comme trop clair alors qu'il est conforme une
      // fois pose. C'est ainsi que .hero-badge, .hero-subtitle et
      // .visual-caption remontaient par intermittence.
      // Les animations infinies (spinners) sont exclues : elles ne finissent
      // jamais et bloqueraient l'attente.
      await page.waitForFunction(
        () =>
          document.getAnimations().every((a) => {
            if (a.playState !== 'running') return true;
            const iterations = a.effect?.getTiming().iterations ?? 1;
            return iterations === Infinity;
          }),
        undefined,
        { timeout: 10_000 }
      );

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
        `[axe] ${gabarit.path} : ${accessibilityScanResults.violations.length} violation(s) ` +
          `(${bloquantes.length} bloquante(s))`
      );
      for (const v of bloquantes) {
        console.log(`  - [${v.impact}] ${v.id} : ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    target: ${node.target.join(' ')}`);
        }
      }

      expect(
        bloquantes,
        `${bloquantes.length} violation(s) WCAG serieuse(s) ou critique(s) sur ${gabarit.path}`
      ).toEqual([]);
    });
  }
});
