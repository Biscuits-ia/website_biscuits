import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import compress from 'astro-compress';
import partytown from '@astrojs/partytown';
import robotsTxt from 'astro-robots-txt';
import tailwindcss from '@tailwindcss/vite';

// PostCSS plugins
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';

import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',
  
  // Optimisation du build pour performance maximale
  build: {
    // Inline les petits assets pour réduire les requêtes HTTP
    inlineStylesheets: 'auto',
    // Active le code splitting pour TBT optimal
    split: true,
    // Assets optimisés
    assets: '_astro',
  },
  
  // Optimisation des images (crucial pour LCP)
  image: {
    // Formats modernes pour performance
    formats: ['avif', 'webp'],
    // Service de traitement optimisé
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false,
      },
    },
  },
  
  // Compression optimale (améliore Performance et Best Practices)
  compressHTML: true,
  
  // Prefetch automatique pour navigation rapide
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
  
  // Vite optimisations
  vite: {
    plugins: [
      // Tailwind CSS v4 — se branche via plugin Vite, pas via intégration Astro
      tailwindcss(),
    ],
    build: {
      // Code splitting optimal
      rollupOptions: {
        output: {
          // Sépare les chunks pour meilleur cache
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('svelte')) return 'vendor-svelte';
              if (id.includes('react')) return 'vendor-react';
              return 'vendor';
            }
          },
        },
      },
      // Optimisations CSS
      cssCodeSplit: true,
      // Minification maximale
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info'],
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      },
    },
    // Optimisations CSS
    css: {
      postcss: {
        plugins: [
          autoprefixer(),
          cssnano({
            preset: ['default', {
              discardComments: { removeAll: true },
            }],
          }),
        ],
      },
    },
    // Optimisations dev
    server: {
      // Pas d'impact sur Lighthouse mais améliore DX
      hmr: true,
    },
  },
  
  // Intégrations optimisées pour Lighthouse 100
  integrations: [// Svelte
  svelte(), // Sitemap pour SEO
  sitemap({
    changefreq: 'weekly',
    priority: 0.7,
    filter: (page) => !page.includes('/admin') && !page.includes('/api'),
  }), // Partytown pour scripts tiers (améliore TBT)
  partytown({
    config: {
      // Déplace les scripts lourds dans un Web Worker
      forward: ['dataLayer.push', 'gtag'],
    },
  }), // Compression maximale (HTML, CSS, JS, Images)
  compress({
    CSS: true,
    HTML: {
      removeAttributeQuotes: false,
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
    },
    Image: {
      avif: {
        quality: 80,
      },
      webp: {
        quality: 85,
      },
      jpg: {
        quality: 85,
      },
      png: {
        quality: 85,
      },
    },
    JavaScript: true,
    SVG: {
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: false,
            },
          },
        },
        'removeDoctype',
        'removeComments',
      ],
    },
  }), // Robots.txt
  robotsTxt(), icon()],
  
  // Headers HTTP : configurez dans vercel.json ou _headers selon votre hébergeur
  
  // Optimisation markdown (si utilisé)
  markdown: {
    shikiConfig: {
      // Thème léger pour performance
      theme: 'github-light',
    },
  },
  
  // Optimisation output
  output: 'static',
  
  // Adapter si SSR (commenté car on est en static)
  // adapter: node({
  //   mode: 'standalone'
  // }),
});