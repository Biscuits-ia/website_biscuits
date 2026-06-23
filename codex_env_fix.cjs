const fs = require('fs');
const path = 'src/env.d.ts';
let src = fs.readFileSync(path, 'utf8');
// Ajouter PUBLIC_SITE_HOST
if (!src.includes('PUBLIC_SITE_HOST')) {
  src = src.replace(
    '  readonly PUBLIC_SITE_URL?: string;',
    '  readonly PUBLIC_SITE_URL?: string;\n  readonly PUBLIC_SITE_HOST?: string;'
  );
  fs.writeFileSync(path, src, 'utf8');
  console.log('PUBLIC_SITE_HOST ajoute a env.d.ts');
}
