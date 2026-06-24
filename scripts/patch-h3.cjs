const fs = require('fs');
const path = 'src/content.config.ts';
let s = fs.readFileSync(path, 'utf8');

// Replace `z` from astro:content (deprecated) with `z` from zod directly
s = s.replace("import { defineCollection, z } from 'astro:content';",
              "import { defineCollection } from 'astro:content';\nimport { z } from 'zod';");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h3 content.config.ts zod');
