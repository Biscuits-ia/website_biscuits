// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import svelte from '@astrojs/svelte';
import compress from 'astro-compress';


import robots from 'astro-robots';


// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',
  integrations: [mdx(), svelte(), compress({
    CSS: true,
    HTML: true,
    Image: true,
    JavaScript: true,
    SVG: true,
  }), sitemap({
changefreq: 'weekly',
priority: 0.7,
lastmod: new Date(),
}), vercel(),
robots({
      host: 'biscuits-ia.com',
      sitemap: [
        "https://biscuits-ia.com/sitemap.xml",
      ],
      policy: [
        {
          userAgent: [
            "Applebot",
            "Googlebot",
            "bingbot",
            "Yandex",
            "Yeti",
            "Baiduspider",
            "360Spider",
            "*",
          ],
          allow: ["/"],
          crawlDelay: 5,
        },
        {
          userAgent: "BLEXBot",
          disallow: ["/assets", "/uploades/1989-08-21/*jpg$"],
        },
      ],
    }),
  ],

  output: 'static',
  
  build: {
    inlineStylesheets: 'auto',
  },
  
  vite: {
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      
      rollupOptions: {
        output: {
          manualChunks: {
            'gsap': ['gsap'],
            'animations': ['gsap/ScrollTrigger', 'gsap/ScrollToPlugin'],
          },
        },
      },
    },
    
    // Optimisation des assets
    assetsInclude: ['**\/*.webp', '**\/*.avif'],
  },
  
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: 268402689,
      },
    },
  },
  
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});