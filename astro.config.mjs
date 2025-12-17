// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import svelte from '@astrojs/svelte';
import compress from 'astro-compress';


// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',

  integrations: [
    mdx(), 
    svelte(), 
    compress({
      CSS: true,
      HTML: true,
      Image: false,
      JavaScript: true,
      SVG: true,
    }),
    sitemap({
  changefreq: 'weekly',
  priority: 0.7,
  lastmod: new Date(),
  }), vercel()],

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