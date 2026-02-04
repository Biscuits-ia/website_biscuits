// @ts-check
import { defineConfig } from 'astro/config';


import robotsTxt from 'astro-robots-txt';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import svelte from '@astrojs/svelte';

import vercel from '@astrojs/vercel';

import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',

  integrations: [svelte({
    preprocess: [],
  }), sitemap({
    changefreq: 'weekly',
    priority: 0.7,
    filter: (page) => {
      const excludePaths = ['/admin', '/api', '/login', '/register', '/dashboard'];
      return !excludePaths.some(path => page.includes(path));
    },
    // Entrées personnalisées
    customPages: ['https://biscuits-ia.com/'],
    i18n: {
      defaultLocale: 'fr',
      locales: {
        fr: 'fr-FR',
      },
    },
    // Limiter la taille du sitemap
    entryLimit: 50000,
  }), // Partytown configuré pour éviter les warnings
 robotsTxt({
    sitemap: [
      'https://biscuits-ia.com/sitemap-index.xml',
      'https://biscuits-ia.com/sitemap-0.xml',
    ],
    policy: [
      {
        userAgent: '*',
        allow: '/',
        crawlDelay: 1,
      },
      // Règles spécifiques pour Google
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin', '/api'],
        crawlDelay: 0.5,
      },
    ],
  }), icon()],


  vite: {
    plugins: [tailwindcss()]
  },

  output: 'static',
  build: {
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  

  adapter: vercel()
});