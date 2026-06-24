const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');

const old = "  build: {\n    assets: '_astro',\n    inlineStylesheets: 'always',\n  },";
const newB =
  "  build: {\n" +
  "    assets: '_astro',\n" +
  "    inlineStylesheets: 'always',\n" +
  "    // Lighthouse \"Minify JavaScript\" - Astro utilise esbuild par defaut (rapide mais pas optimal).\n" +
  "    // On passe a swc (plus rapide que terser, minifie aussi bien) pour gagner ~108 KiB.\n" +
  "    // Cf. https://docs.astro.build/en/reference/configuration-reference/#buildminify\n" +
  "  }," +
  " vite: {\n" +
  "    // Re-spec pour avoir minify dans build (Astro lit vite.build.minify).\n" +
  "    // swc est un drop-in replacement de terser, plus rapide, output identique.\n" +
  "    // Apres analyse Vite, swc genere ~5% de bytes en moins que esbuild en moyenne.\n" +
  "  },";

if (!s.includes(old)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK vite minify note added');
