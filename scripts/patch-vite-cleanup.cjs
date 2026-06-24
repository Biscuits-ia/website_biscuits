const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');
// Remove the orphan first vite block (the one without minify config)
const old = "  vite: {\n    plugins: [tailwindcss()],\n    resolve: {\n      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],\n" +
  "      dedupe: ['react', 'react-dom'],\n" +
  "    },\n" +
  "  },\n\n  output: 'server',";
const newB = "  output: 'server',";
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK vite cleaned up');
