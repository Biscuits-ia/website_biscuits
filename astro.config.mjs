// @ts-check
import { defineConfig } from 'astro/config';


import robotsTxt from 'astro-robots-txt';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

import vercel from '@astrojs/vercel';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';

import asyncCss from './scripts/astro-async-css.mjs';
import rehypeLazyFigure from './scripts/rehype-lazy-figure.mjs';
import rehypeTaskListA11y from './scripts/rehype-task-list-a11y.mjs';

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
          // Aligne avec DISALLOW_SEARCH_ONLY (robots.txt) : page publique mais
          // volontairement hors index (tunnel de paiement/parrainage).
          '/formations/parrainer',
        ];
        return !excludePaths.some((path) => page.includes(path));
      },
      // Priorite/frequence differenciees par type de page plutot qu'une valeur
      // uniforme (0.7/weekly) sur les ~130 URLs : signale aux crawlers ou
      // concentrer le budget de crawl.
      serialize(item) {
        // @astrojs/sitemap ajoute toujours le trailing slash (sauf racine) :
        // on le retire pour comparer les chemins sans dupliquer chaque regle
        // en 2 variantes ("/ateliers" vs "/ateliers/").
        const rawPath = new URL(item.url).pathname;
        const path = rawPath !== '/' && rawPath.endsWith('/')
          ? rawPath.slice(0, -1)
          : rawPath;

        if (path === '' || path === '/' || path === '/fr') {
          return { ...item, changefreq: ChangeFreqEnum.DAILY, priority: 1.0 };
        }
        if (path === '/blog') {
          return { ...item, changefreq: ChangeFreqEnum.DAILY, priority: 0.8 };
        }
        if (path.startsWith('/blog/tag/')) {
          return { ...item, changefreq: ChangeFreqEnum.MONTHLY, priority: 0.5 };
        }
        if (path.startsWith('/blog/')) {
          return { ...item, changefreq: ChangeFreqEnum.WEEKLY, priority: 0.8 };
        }
        if (path === '/piliers' || path.startsWith('/piliers/')) {
          return { ...item, changefreq: ChangeFreqEnum.WEEKLY, priority: 0.9 };
        }
        if (
          path === '/formations' ||
          (path.startsWith('/formations/') && !path.includes('/inscription'))
        ) {
          return { ...item, changefreq: ChangeFreqEnum.WEEKLY, priority: 0.8 };
        }
        if (path === '/ateliers' || path.startsWith('/combats')) {
          return { ...item, changefreq: ChangeFreqEnum.WEEKLY, priority: 0.8 };
        }
        if (path.startsWith('/legal/')) {
          return { ...item, changefreq: ChangeFreqEnum.MONTHLY, priority: 0.3 };
        }
        if (path.startsWith('/auteur/')) {
          return { ...item, changefreq: ChangeFreqEnum.MONTHLY, priority: 0.5 };
        }

        return item;
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
    asyncCss(),
  ],

  output: 'server',

  markdown: {
    // Images de prose (blog) : lazy-load + figure/figcaption automatiques.
    // Cf. scripts/rehype-lazy-figure.mjs.
    rehypePlugins: [rehypeLazyFigure, rehypeTaskListA11y],
  },

  // ─── CSP : pourquoi `security.csp` n'est PAS active ────────────────────────
  //
  // Astro 7 sait generer un CSP a base de hashes (`security: { csp: {...} }`),
  // emis en <meta> sur les pages prerendered et en header en SSR. C'est la
  // destination correcte. QUATRE blocages, tous VERIFIES sur le build reel et
  // la production (dernier controle : audit 2026-07-09, cf. AUDIT-back.md S4) :
  //
  //  1. Des que style-src contient un hash, le navigateur IGNORE 'unsafe-inline'
  //     (spec CSP3). Or le build compte 514 attributs `style="..."` sur les 130
  //     pages (mesure 2026-07-09, en hausse : 384 en juillet) + 309 balises
  //     <style> inline -> "Applying inline style violates ... blocked".
  //     Regression visuelle immediate. Astro hashe les <style> qu'il controle,
  //     donc activer `security.csp` emet forcement un hash style-src : les 514
  //     attributs cassent tous.
  //
  //  2. Shiki (coloration syntaxique du blog, 8 pages) emet des styles inline.
  //     Astro le signale lui-meme au build.
  //
  //  3. Astro ne hashe PAS les scripts `is:inline`. Il en reste 3 (sw-register,
  //     __ANALYTICS_DISABLED__, config GTM) a convertir ou a declarer dans
  //     `scriptDirective.hashes`.
  //
  //  4. AJOUTE 2026-07-09 -- BLOQUEUR INFRASTRUCTURE, hors du code :
  //     Cloudflare (Bot Fight Mode / JS Detections) INJECTE a l'edge, par
  //     intermittence, un <script> inline sans nonce ni hash stable :
  //       window.__CF$cv$params={r:'<jeton-par-requete>', ...}
  //     Le jeton change a chaque requete -> AUCUN hash ni nonce ne peut
  //     l'autoriser. Tout `script-src` strict (hash OU nonce) le bloque. Ce
  //     script est deja bloque en silence sur les routes SSR (CSP nonce du
  //     middleware) -- y compris la page de connexion, ou la protection anti-bot
  //     compte le plus. Fermer S4 sur les pages prerendered exige donc D'ABORD
  //     une decision cote Cloudflare : desactiver Bot Fight Mode / JS Detections,
  //     ou accepter la degradation de la detection anti-bot.
  //
  // Chemin de migration (cf. AUDIT-back.md, plan point 9) :
  //   a. TRANCHER le point 4 cote Cloudflare (decision produit/securite) ;
  //   b. supprimer les 514 attributs style="" au profit de classes ;
  //   c. passer Shiki en theme a variables CSS (`markdown.shikiConfig`) ;
  //   d. convertir les 3 scripts `is:inline` OU declarer leurs hashes via
  //      `scriptDirective.hashes` ;
  //   e. activer `security.csp` et supprimer le script-src 'unsafe-inline' du
  //      middleware + celui de vercel.json (le <meta> et le header s'intersectent
  //      cote navigateur : les deux doivent bouger ensemble).
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

