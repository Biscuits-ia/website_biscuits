// playwright.config.ts — configuration Playwright (cf. P4 #34)
//
// Pourquoi cette config :
// - chromium uniquement (le site n'utilise pas de feature Safari/Firefox-
//   only, et l'audit n'a pas releve de bug specifique a ces moteurs) ;
//   ajouter d'autres navigateurs alourdit le runner sans valeur ajoutee
//   immediate.
// - `webServer: astro dev` : Playwright démarre l'app avant les tests,
//   puis l'arrete. Pas besoin de la lancer a la main.
// - Pas de CI pour l'instant : l'item P4 #34 dit explicitement qu'il
//   faut d'abord un Supabase de test, et nous n'en avons pas.
//   Activer le job CI se fera dans un commit ulterieur, avec une
//   variable `RUN_E2E` et un environnement isole.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // 30s : au-dessus du timeout par defaut (5s) pour absorber le demarrage
  // d'astro dev (cold start ~10s) + le premier rendu.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Pas de retry en local : on veut voir la verite, pas un flaky-test
  // masque par 3 tentatives.
  retries: 0,
  // Un seul worker en local : on n'a pas de CI a paralliser, et plusieurs
  // workers tapent sur le meme astro dev -> race sur le port.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    // `headless: true` est le defaut Playwright. On l'ecrit explicitement
    // pour qu'un `PLAYWRIGHT_HEADLESS=0 npm run test:e2e` local puisse
    // basculer en mode fenetre.
    headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // `astro dev` (port 4321 par defaut) sert le site sans build. Plus
    // rapide qu'`astro preview` (qui demarre un server statique sur le
    // build) et permet d'atteindre les routes SSR sans rebuild a chaque
    // modif du test.
    command: 'npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
