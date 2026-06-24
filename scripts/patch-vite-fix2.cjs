const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// plugins/resolve/esbuild live in vite, not build. Move them.
const old = "  build: {\n" +
  "    plugins: [tailwindcss()],\n" +
  "    resolve: {\n" +
  "      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],\n" +
  "      dedupe: ['react', 'react-dom'],\n" +
  "    },\n" +
  "    // Lighthouse \"Minify JavaScript\" (108 KiB savings) + \"Reduce unused JS\" (3 087 KiB).\n" +
  "    // Vite par defaut utilise esbuild : rapide mais pas optimal.\n" +
  "    // 'minify: esbuild' (defaut) est ~2x plus rapide que terser et output comparable.\n" +
  "    // 'cssMinify: esbuild' active la minification CSS en plus de JS.\n" +
  "    // On garde esbuild (defaut) mais on documente : Astro 5+ active par defaut.\n" +
  "    build: {\n" +
  "      minify: 'esbuild',\n" +
  "      cssMinify: 'esbuild',\n" +
  "      cssCodeSplit: true,\n" +
  "      reportCompressedSize: false,\n" +
  "      target: 'es2022',\n" +
  "    },\n" +
  "    esbuild: {\n" +
  "      // Elimine les exports inutilises au build (tree-shaking agressif).\n" +
  "      treeShaking: true,\n" +
  "      // Supprime les console.* en prod (reduit ~10 KiB sur les gros bundles).\n" +
  "      drop: ['debugger'],\n" +
  "      legalComments: 'none',\n" +
  "    },\n" +
  "  },";

const newB =
  "  build: {\n" +
  "    assets: '_astro',\n" +
  "    inlineStylesheets: 'always',\n" +
  "    // Lighthouse: minify JS + CSS via esbuild (defaut Vite, deja actif). Cf.audit.md section 10.\n" +
  "    // cssCodeSplit = split CSS par page (reduit le CSS inutilise envoye sur chaque page).\n" +
  "  },\n" +
  "  vite: {\n" +
  "    plugins: [tailwindcss()],\n" +
  "    resolve: {\n" +
  "      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],\n" +
  "      dedupe: ['react', 'react-dom'],\n" +
  "    },\n" +
  "    build: {\n" +
  "      minify: 'esbuild',\n" +
  "      cssMinify: 'esbuild',\n" +
  "      cssCodeSplit: true,\n" +
  "      reportCompressedSize: false,\n" +
  "      target: 'es2022',\n" +
  "    },\n" +
  "    esbuild: {\n" +
  "      treeShaking: true,\n" +
  "      drop: ['debugger'],\n" +
  "      legalComments: 'none',\n" +
  "    },\n" +
  "  },";

if (!s.includes(old)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK vite config valid');
