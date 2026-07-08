// eslint.config.js — flat config (ESLint 10) — audit.md P2 #17
//
// Niveau « Recommended + Astro » : bon rapport signal/bruit, sans type-checking
// (rapide, pas de projet TS a charger). L'ancien format .eslintrc n'existe plus :
// ESLint 10 exige cette flat config. Tant qu'elle etait absente, le script
// `lint` echouait et le job lint du CI etait skippe.
//
// Regles a fort volume sur le code existant (any, variables inutilisees)
// abaissees en `warn` : elles restent visibles sans bloquer le CI. A durcir
// progressivement (cf. audit P3/P4).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.astro/',
      '.vercel/',
      'node_modules/',
      'public/',
      'scripts/patch-*.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  {
    // Scripts inline .astro + code SSR : globals navigateur ET Node.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  {
    rules: {
      // Present dans le code existant (~27 `any`, entrees reseau) : signale
      // sans bloquer. A resorber avec zod (audit P3 #22).
      '@typescript-eslint/no-explicit-any': 'warn',
      // Tolere les args/vars prefixes `_` (convention "volontairement inutilise").
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Les catch silencieux volontaires (reseau non critique) sont documentes
      // dans le code : on ne bloque que sur les AUTRES blocs vides.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Regles stylistiques/pedantes, sans impact runtime, nombreuses sur le
      // code existant : signalees en `warn` pour ne pas noyer le CI. A nettoyer
      // au fil de l'eau (souvent auto-fixable via `npm run lint:fix`).
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      // Contenus FR : espaces insecables (nbsp) legitimes dans le texte.
      'no-irregular-whitespace': ['warn', { skipStrings: true, skipTemplates: true }],
    },
  },

  {
    // Fichiers de conf / scripts Node : CommonJS + globals Node uniquement.
    files: ['**/*.cjs', '**/*.config.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
