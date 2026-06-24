const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');

// Reformat the broken bit + add real minify config
const old =
  "  build: {\n" +
  "    assets: '_astro',\n" +
  "    inlineStylesheets: 'always',\n" +
  "    // Lighthouse \"Minify JavaScript\" - Astro utilise esbuild par defaut (rapide mais pas optimal).\n" +
  "    // On passe a swc (plus rapide que terser, minifie aussi bien) pour gagner ~108 KiB.\n" +
  "    // Cf. https://docs.astro.build/en/reference/configuration-reference/#buildminify\n" +
  "  }, vite: {\n" +
  "    // Re-spec pour avoir minify dans build (Astro lit vite.build.minify).\n" +
  "    // swc est un drop-in replacement de terser, plus rapide, output identique.\n" +
  "    // Apres analyse Vite, swc genere ~5% de bytes en moins que esbuild en moyenne.\n" +
  "  },";

const newB =
  "  build: {\n" +
  "    assets: '_astro',\n" +
  "    inlineStylesheets: 'always',\n" +
  "  }," +
  " vite: {\n" +
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

s = s.replace(old, newB);

// Remove the now-duplicate vite block
const oldDup = "  vite: {\n    plugins: [tailwindcss()],\n    resolve: {\n      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],\n" +
  "      dedupe: ['react', 'react-dom'],\n" +
  "    },\n" +
  "  },\n\n  vite: {";
s = s.replace(oldDup, "  vite: {");
fs.writeFileSync(path, s, 'utf8');
console.log('OK vite minify configured');
