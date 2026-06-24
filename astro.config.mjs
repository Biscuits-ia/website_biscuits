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

