// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import svelte from '@astrojs/svelte';
import compress from 'astro-compress';



import robots from 'astro-robots';


import icon from 'astro-icon';


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
}), vercel(), robots({
        host: 'biscuits-ia.com',
        sitemap: [
          "https://biscuits-ia.com//sitemap-index.xml",
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
          },
        ],
      }), icon()],

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
    
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin'],
    },
    
    ssr: {
      noExternal: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin'],
    },
    
    
    assetsInclude: ['**\/*.webp', '**\/*.png'],
  },
  
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});