const fs = require('fs');
const path = 'src/content.config.ts';
let s = fs.readFileSync(path, 'utf8');
// Revert zod migration - z from astro:content is still type-compatible
s = s.replace("import { defineCollection } from 'astro:content';\nimport { z } from 'zod';\nimport { glob } from 'astro/loaders';",
              "import { defineCollection, z } from 'astro:content';\nimport { glob } from 'astro/loaders';");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-revert content.config.ts');
