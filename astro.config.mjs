// @ts-check
import { defineConfig } from 'astro/config';


import robotsTxt from 'astro-robots-txt';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

import vercel from '@astrojs/vercel';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';

// ─── robots.txt ───────────────────────────────────────────────────────────────
//
// ATTENTION : ne JAMAIS recreer public/robots.txt. Astro copie public/ vers
// dist/client/ et le fichier statique ecraserait silencieusement la sortie de
// cette integration.
//
// ATTENTION 2 : `userAgent` doit etre une STRING. Passer un tableau fait echouer
// la validation de schema d'astro-robots-txt, qui skippe alors la generation
// SANS erreur bloquante ("astro-robots-txt: Skipped!" dans les logs de build).
// D'ou une policy par user-agent.

/** Chemins jamais indexables : auth, admin, API, espaces prives. */
const DISALLOW_ALL = [
  '/admin',
  '/api',
  '/auth',
  '/dashboard',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialisation-mot-de-passe',
  '/utilisateurs',
  '/verifier-code-inscription',
  '/verifier-code-reinitialisation',
];

/** Pages publiques mais volontairement hors index (donnees personnelles, tunnel). */
const DISALLOW_SEARCH_ONLY = ['/trombinoscope', '/formations/parrainer'];

/**
 * Crawlers LLM explicitement autorises : on veut etre cite dans les reponses
 * des assistants IA. Ils accedent au contenu markdown (llms.txt / llms-full.txt)
 * et au JSON-LD. Cf. https://llmstxt.org/
 */
const LLM_USER_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended', // Google AI training (Gemini) - independant de Googlebot search
  'cohere-ai',
  'cohere-training-data-crawler',
  'Applebot-Extended', // Apple Intelligence
  'CCBot', // Common Crawl (entraine beaucoup de LLM)
  'Bytespider', // ByteDance / TikTok AI
  'Diffbot',
  'DuckAssistBot',
  'FacebookBot',
];

/** @type {import('astro-robots-txt').PolicyItem[]} */
const ROBOTS_POLICY = [
  {
    userAgent: '*',
    allow: '/',
    disallow: [...DISALLOW_ALL, ...DISALLOW_SEARCH_ONLY],
    crawlDelay: 1,
  },
  {
    userAgent: 'Googlebot',
    allow: '/',
    disallow: [...DISALLOW_ALL, ...DISALLOW_SEARCH_ONLY],
  },
  // Une entree par crawler LLM : `userAgent` n'accepte pas de tableau.
  ...LLM_USER_AGENTS.map((userAgent) => ({
    userAgent,
    allow: '/',
    disallow: DISALLOW_ALL,
    crawlDelay: 2,
  })),
];

// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',

  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      filter: (page) => {
        const excludePaths = [
          '/admin',
          '/api',
          '/auth',
          '/connexion',
          '/inscription',
          '/mot-de-passe-oublie',
          '/reinitialisation-mot-de-passe',
          '/dashboard',
          '/trombinoscope',
          '/utilisateurs',
          '/verifier-code-inscription',
          '/verifier-code-reinitialisation',
        ];
        return !excludePaths.some((path) => page.includes(path));
      },
      i18n: {
        defaultLocale: 'fr',
        locales: {
          fr: 'fr-FR',
        },
      },
      entryLimit: 50000,
    }),
    robotsTxt({
      // @astrojs/sitemap genere sitemap-index.xml (qui reference sitemap-0.xml).
      // Pointer sur /sitemap.xml ne renverrait rien : ce fichier n'existe plus.
      sitemap: ['https://biscuits-ia.com/sitemap-index.xml'],
      policy: ROBOTS_POLICY,
      // Documentation LLM (spec llmstxt.org) : sans ce pointeur, les crawlers IA
      // ne decouvrent pas /llms.txt -- ils ne le devinent pas.
      transform: (content) =>
        `${content}\n# Documentation pour assistants IA (https://llmstxt.org/)\n# https://biscuits-ia.com/llms.txt\n# https://biscuits-ia.com/llms-full.txt\n`,
    }),
    icon(),
    mdx(),
    react(),
  ],

  output: 'server',

  // ─── CSP : pourquoi `security.csp` n'est PAS active ────────────────────────
  //
  // Astro 7 sait generer un CSP a base de hashes (`security: { csp: {...} }`),
  // emis en <meta> sur les pages prerendered et en header en SSR. C'est la
  // destination correcte. Trois blocages, tous VERIFIES dans Chrome sur le
  // build reel (2026-07-08) :
  //
  //  1. Des que style-src contient un hash, le navigateur IGNORE 'unsafe-inline'
  //     (spec CSP3). Or le projet compte 384 attributs `style="..."` sur 78
  //     pages -> "Applying inline style violates ... The action has been
  //     blocked." Regression visuelle immediate.
  //
  //  2. Shiki (coloration syntaxique du blog) emet des styles inline. Astro le
  //     signale lui-meme au build : "Shiki syntax highlighting uses inline
  //     styles that are not compatible with CSP".
  //
  //  3. Astro ne hashe PAS les scripts `is:inline` (par definition il n'y touche
  //     pas). Le script d'enregistrement du Service Worker etait bloque.
  //
  // Chemin de migration (cf. audit.md, priorite 3) :
  //   a. supprimer les 384 attributs style="" au profit de classes ;
  //   b. passer Shiki en theme a variables CSS (`markdown.shikiConfig`) ;
  //   c. convertir les 3 scripts `is:inline` OU declarer leurs hashes via
  //      `scriptDirective.hashes` ;
  //   d. activer `security.csp` et supprimer le CSP du middleware + celui de
  //      vercel.json.
  //
  // En attendant : CSP nonce-based par requete pour les routes SSR (middleware),
  // CSP de base par header pour les pages statiques (vercel.json). Ce dernier
  // conserve 'unsafe-inline' sur script-src : il ne protege PAS contre le XSS,
  // il durcit object-src / base-uri / form-action / frame-ancestors.

  build: {
    assets: '_astro',
    // 'auto' : n'inline que les feuilles < 4 Ko. 'always' inlinait ~94 Ko de CSS
    // dans CHAQUE page HTML -- non cachable, retelecharge a chaque navigation,
    // et le HTML ne tenait plus dans le premier round-trip TCP (14 Ko).
    inlineStylesheets: 'auto',
    // Lighthouse: minify JS + CSS via esbuild (defaut Vite, deja actif).
    // cssCodeSplit = split CSS par page (reduit le CSS inutilise envoye sur chaque page).
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
      dedupe: ['react', 'react-dom'],
    },
    build: {
      minify: 'esbuild',
      cssMinify: 'esbuild',
      cssCodeSplit: true,
      reportCompressedSize: false,
      target: 'es2022',
    },
    esbuild: {
      treeShaking: true,
      drop: ['debugger'],
      legalComments: 'none',
    },
  },

  adapter: vercel(),
});

