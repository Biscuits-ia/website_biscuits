// @ts-check
import { defineConfig } from 'astro/config';


import robotsTxt from 'astro-robots-txt';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

import vercel from '@astrojs/vercel';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';

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
      sitemap: [
        'https://biscuits-ia.com/sitemap-index.xml',
        'https://biscuits-ia.com/sitemap-0.xml',
      ],
      policy: [
        {
          userAgent: '*',
          allow: '/',
          disallow: [
            '/admin',
            '/api',
            '/auth',
          '/formations/parrainer',
            '/dashboard',
            '/connexion',
            '/inscription',
            '/mot-de-passe-oublie',
            '/reinitialisation-mot-de-passe',
            '/utilisateurs',
            '/trombinoscope',
            '/verifier-code-inscription',
            '/verifier-code-reinitialisation',
          ],
          crawlDelay: 1,
        },
        {
          userAgent: 'Googlebot',
          allow: '/',
          disallow: [
            '/admin',
            '/api',
            '/auth',
          '/formations/parrainer',
            '/dashboard',
            '/connexion',
            '/inscription',
            '/mot-de-passe-oublie',
            '/reinitialisation-mot-de-passe',
            '/utilisateurs',
            '/trombinoscope',
            '/verifier-code-inscription',
            '/verifier-code-reinitialisation',
          ],
          crawlDelay: 0.5,
        },
        // P0 GEO : politique explicite pour les crawlers LLM (GPTBot, ClaudeBot,
        // PerplexityBot, Google-Extended, anthropic-ai, cohere-ai, Applebot-Extended,
        // CCBot, Bytespider). On les AUTORISE explicitement avec crawlDelay
        // pour qu'ils puissent indexer le contenu en markdown (llms.txt + llms-full.txt)
        // et le schema JSON-LD. Cf. https://llmstxt.org/ et audit.md section 9.
        /** @type {any} */
        (() => {
        const p = {
          userAgent: [
            'GPTBot',
            'ChatGPT-User',
            'ClaudeBot',
            'Claude-Web',
            'PerplexityBot',
            'Perplexity-User',
            'Google-Extended', // Google AI training (Gemini) - independant de Googlebot search
            'anthropic-ai',
            'Claude-User',
            'cohere-ai',
            'cohere-training-data-crawler',
            'Applebot-Extended', // Apple Intelligence
            'CCBot', // Common Crawl (entraine beaucoup de LLM)
            'Bytespider', // ByteDance / TikTok AI
            'Diffbot',
            'DuckAssistBot',
            'FacebookBot',
            'OAI-SearchBot',
          ],
          allow: '/',
          disallow: [
            '/admin',
            '/api',
            '/auth',
            '/dashboard',
            '/connexion',
            '/inscription',
            '/mot-de-passe-oublie',
            '/reinitialisation-mot-de-passe',
            '/verifier-code-inscription',
            '/verifier-code-reinitialisation',
          ],
          crawlDelay: 2,
        };
        return p;
        })(),
      ],
    }),
    icon(),
    mdx(),
    react(),
  ],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
      dedupe: ['react', 'react-dom'],
    },
  },

  output: 'server',
  build: {
    assets: '_astro',
    inlineStylesheets: 'always',
  },

  adapter: vercel(),
});

