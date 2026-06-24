const fs = require('fs');
const path = 'src/env.d.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// The issue: env.d.ts uses `declare namespace App` (ambient declaration) which
// does NOT merge with the `declare global { namespace App }` from astro/extendables.d.ts.
// We need to use `declare global { namespace App }` so the interface extends instead of
// clashing, AND we need to make sure the import is referenced.

const old =
  'declare namespace App {' + NL +
  '  interface Locals {' + NL +
  '    nonce: string;' + NL +
  '    supabase: import(\'@supabase/supabase-js\').SupabaseClient;' + NL +
  '  }' + NL +
  '}';

const newB =
  'declare global {' + NL +
  '  namespace App {' + NL +
  '    interface Locals {' + NL +
  '      /** CSP nonce genere par le middleware, injecte dans les <script> inline. */' + NL +
  '      nonce: string;' + NL +
  '      /** Client Supabase reauthentifiable partage par toutes les requetes du middleware. */' + NL +
  '      supabase: import(\'@supabase/supabase-js\').SupabaseClient;' + NL +
  '    }' + NL +
  '  }' + NL +
  '}' + NL +
  'export {};';

if (!s.includes(old)) { console.error('NOT FOUND p2-6'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-6 env.d.ts App.Locals -> global namespace');
