// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import astroParser from 'astro-eslint-parser';
import eslintPluginAstro from 'eslint-plugin-astro';

export default [
  // Base JS recommandé
  eslint.configs.recommended,
  
  // TypeScript
  ...tseslint.configs.recommended,
  
  // Astro
  ...eslintPluginAstro.configs.recommended,
  
  // Fichiers TypeScript
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  
  // Fichiers Astro
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        extraFileExtensions: ['.astro'],
      },
    },
  },
  
  // Ignorer les builds
  {
    ignores: ['dist/**', 'node_modules/**', '.astro/**'],
  },
];