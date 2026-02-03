import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import compress from 'astro-compress';
import partytown from '@astrojs/partytown';
import robotsTxt from 'astro-robots-txt';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

// PostCSS plugins
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';

// https://astro.build/config
export default defineConfig({
  site: 'https://biscuits-ia.com',
  
  // Optimisation du build pour performance maximale
  output: 'static',
  build: {
    // Chemin pour les assets générés
    assets: '_astro',
    // Inline les petits assets
    inlineStylesheets: 'auto',
    // Code splitting optimisé
    split: true,
  },
  
  // Optimisation des images
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false,
      },
    },
  },
  
  // Compression optimale
  compressHTML: true,
  
  // Prefetch automatique
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
  
  // Vite optimisations
  vite: {
    plugins: [
      tailwindcss(),
    ],
    
    // Configuration de build
    build: {
      // Minification optimisée
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // En production seulement
          drop_debugger: true,
          pure_funcs: ['console.debug', 'console.info'],
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      },
      
      // Code splitting optimisé
      rollupOptions: {
        output: {
          // Optimisation du cache avec hash
          entryFileNames: '_astro/[hash][extname]',
          chunkFileNames: '_astro/[hash].js',
          assetFileNames: '_astro/[hash][extname]',
          
          // Chunks optimisés
          manualChunks: (id) => {
            // Séparation des vendors
            if (id.includes('node_modules')) {
              if (id.includes('svelte')) return 'vendor-svelte';
              if (id.includes('three') || id.includes('webgl')) return 'vendor-3d';
              if (id.includes('chart') || id.includes('d3')) return 'vendor-charts';
              return 'vendor';
            }
          },
        },
      },
      
      // Optimisations CSS
      cssCodeSplit: true,
      cssMinify: true,
      
      // Sourcemaps en développement seulement
      sourcemap: process.env.NODE_ENV === 'development',
    },
    
    // Optimisations CSS
    css: {
      postcss: {
        plugins: [
          autoprefixer(),
          cssnano({
            preset: ['default', {
              discardComments: { removeAll: true },
              // Optimisations pour réduire la taille
              normalizeWhitespace: true,
              cssDeclarationSorter: true,
            }],
          }),
        ],
      },
      // Minimiser la génération de sourcemaps CSS
      devSourcemap: false,
    },
    
    // Optimisations server
    server: {
      hmr: process.env.NODE_ENV === 'development',
      // Headers pour le développement
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    },
    
    // Configuration spécifique pour éviter les warnings
    define: {
      __PARTYTOWN_DEBUG__: false,
      // Désactiver les APIs dépréciées dans Partytown
      __PARTYTOWN_SHARED_STORAGE__: false,
      __PARTYTOWN_ATTRIBUTION_REPORTING__: false,
    },
    
    // Optimisation des résolutions
    resolve: {
      dedupe: ['svelte', '@sveltejs/kit'],
      alias: {
        // Éviter les duplications
        'react': false,
        'vue': false,
      },
    },
  },
  
  // Intégrations optimisées
  integrations: [
    icon({
      include: {
        mdi: ['*'],
      },
      iconDir: 'src/assets/icons',
    }),

    svelte({
      // Optimisations Svelte
      compilerOptions: {
        hydratable: true,
        enableSourcemap: false,
        dev: process.env.NODE_ENV === 'development',
      },
      preprocess: [],
    }),
    
    sitemap({
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
    }),
    
    // Partytown configuré pour éviter les warnings
    partytown({
      // Désactiver le sandbox qui cause les warnings
      config: {
        forward: ['dataLayer.push', 'gtag'],
        // Désactiver les fonctionnalités problématiques
        useSandbox: false,
        // Configuration pour éviter les APIs dépréciées
        resolveUrl: function(url, location, type) {
          // Bloquer les URLs avec les APIs dépréciées
          const deprecatedPatterns = [
            'attribution',
            'shared-storage',
            'sharedstorage',
            'attribution-reporting'
          ];
          
          if (deprecatedPatterns.some(pattern => url.includes(pattern))) {
            console.log('[Partytown] Bloqué URL avec API dépréciée:', url);
            return null;
          }
          
          return url;
        },
        // Désactiver le debug en production
        debug: process.env.NODE_ENV === 'development',
      },
      // Injecter le script dans le head
      injectScript: true,
    }),
    
    compress({
      // Compression CSS
      CSS: true,
      
      // Compression HTML optimisée
      HTML: {
        removeAttributeQuotes: false,
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        removeComments: true,
        removeEmptyAttributes: true,
        minifyCSS: true,
        minifyJS: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
      },
      
      // Compression des images
      Image: false, // Déjà géré par Astro Image
      
      // Compression JavaScript
      JavaScript: true,
      JS: {
        compress: true,
        mangle: true,
        format: {
          comments: false,
        },
      },
      
      // Compression SVG
      SVG: {
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                removeViewBox: false,
                cleanupIDs: true,
                removeTitle: true,
                removeDesc: true,
              },
            },
          },
          'removeDoctype',
          'removeComments',
          'sortAttrs',
        ],
      },
      
      // Logs seulement en développement
      logger: 0,
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
            '/admin/*',
            '/api',
            '/api/*',
            '/login',
            '/register',
            '/dashboard',
            '/dashboard/*',
            '/*.json$',
            '/*.xml$',
            '/*.pdf$',
          ],
          crawlDelay: 1,
        },
        // Règles spécifiques pour Google
        {
          userAgent: 'Googlebot',
          allow: '/',
          disallow: ['/admin', '/api'],
          crawlDelay: 0.5,
        },
        // Règles pour les bots IA
        {
          userAgent: ['GPTBot', 'ChatGPT-User', 'anthropic-ai', 'Claude-Web'],
          allow: '/',
          disallow: ['/admin', '/api'],
          crawlDelay: 1,
        },
      ],
    }),
  ],
  
  // Service Worker config
  serviceWorker: {
    workbox: false, // Nous utilisons notre propre SW
  },
  
  // Markdown config
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
    syntaxHighlight: 'shiki',
  },
  
  // Sécurité et headers
  security: {
    checkOrigin: true,
  },
});