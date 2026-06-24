const fs = require('fs');
const path = 'audit.md';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const oldP2 =
  '### P2 (backlog)' + NL +
  '' + NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P2** | D' + String.fromCharCode(233) + 'clarer `Astro.locals` (nonce, supabase) dans `env.d.ts` -> ' + String.fromCharCode(233) + 'limine ~14 erreurs TS | 10 min |' + NL +
  '| **P2** | Typer `formatDate(iso)` dans `src/pages/legal/index.astro` | 2 min |' + NL +
  '| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2** | Normaliser logs en JSON | 1 h |' + NL;

const newP2 =
  '### P2 (corrig' + String.fromCharCode(233) + 's - 2026-06-24)' + NL +
  '' + NL +
  '| # | Action | Fichier | Statut |' + NL +
  '|---|---|---|---|' + NL +
  '| 3.1 | Typer `formatDate(iso: string | null \\| undefined): string` | `src/pages/legal/index.astro` | OK |' + NL +
  '| 3.2 | Ajouter `is:inline` + strip TS dans script `define:vars` (window.supabase cast, payload annotation) | `src/pages/dashboard/benevole/project/[id].astro` | OK |' + NL +
  '| 3.3 | Fix `authHeader !== Bearer` -> template literal `Bearer ${expectedSecret}` | `src/pages/api/cron/email-outbox.ts` | OK |' + NL +
  '| 3.4 | Ajouter `supabase` au retour `getAuthContext` (utilis' + String.fromCharCode(233) + ' par GET handler sur `ctx.supabase`) | `src/pages/api/benevole/tasks.ts` | OK |' + NL +
  '| 3.5 | Helper `getAdherentsAuthContextFlat()` (union discrimin' + String.fromCharCode(233) + 'e `ok`) + maj `groupes/index.ts` et `groupes/[id]/adherents.ts` | `src/lib/adherentsApi.ts` + 2 routes | OK |' + NL +
  '| 3.6 | `env.d.ts`: `declare namespace App` -> `declare global { namespace App }` pour merger avec l' + String.fromCharCode(39) + 'extendable Astro' + String.fromCharCode(39) + ' | `src/env.d.ts` | OK |' + NL +
  '' + NL +
  '### P2 (backlog restant)' + NL +
  '' + NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2** | Normaliser logs en JSON | 1 h |' + NL +
  '| **P2** | Warnings `ts(6133)` (variables d' + String.fromCharCode(233) + 'structur' + String.fromCharCode(233) + 'es non utilis' + String.fromCharCode(233) + 'es) | 15 min |' + NL;

if (!s.includes(oldP2)) { console.error('P2 SECTION NOT FOUND'); process.exit(1); }
s = s.replace(oldP2, newP2);

const old8 = '## 8. V' + String.fromCharCode(233) + 'rification apr' + String.fromCharCode(232) + 's P0 + P1';
const new8 = '## 8. V' + String.fromCharCode(233) + 'rification apr' + String.fromCharCode(232) + 's P0 + P1 + P2';
if (s.includes(old8)) s = s.replace(old8, new8);

const oldResult =
  '- `npx astro check` : **26 erreurs** (baseline P0, toutes pr' + String.fromCharCode(233) + '-existantes, aucune nouvelle introduite par P1).' + NL +
  '  - Les 14 erreurs `Property ' + String.fromCharCode(39) + 'nonce' + String.fromCharCode(39) + ' does not exist on type ' + String.fromCharCode(39) + 'Locals' + String.fromCharCode(39) + '` (et `supabase`) viennent' + NL +
  '    d' + String.fromCharCode(39) + 'un typage manquant dans `src/env.d.ts`. Corrig' + String.fromCharCode(233) + ' en P2 en ajoutant :' + NL +
  '    ```ts' + NL +
  '    declare namespace App {' + NL +
  '      interface Locals { nonce: string; supabase: SupabaseClient; }' + NL +
  '    }' + NL +
  '    ```';

const newResult =
  '- `npx astro check` : **0 erreur, 0 warning, 44 hints** (P2 a tout r' + String.fromCharCode(233) + 'solu).' + NL +
  '  - Les 14 erreurs `Property ' + String.fromCharCode(39) + 'nonce' + String.fromCharCode(39) + ' does not exist on type ' + String.fromCharCode(39) + 'Locals' + String.fromCharCode(39) + '` venaient d' + String.fromCharCode(39) + 'un namespace ambient `declare namespace App`' + NL +
  '    qui ne mergeait pas avec l' + String.fromCharCode(39) + 'extendable Astro. R' + String.fromCharCode(233) + 'solu en passant `declare global { namespace App }`.' + NL +
  '  - Les 3 erreurs `Property ' + String.fromCharCode(39) + 'ctx' + String.fromCharCode(39) + ' does not exist` venaient d' + String.fromCharCode(39) + 'un destructuring direct d' + String.fromCharCode(39) + 'une union non discrimin' + String.fromCharCode(233) + 'e.' + NL +
  '    R' + String.fromCharCode(233) + 'solu par un helper `getAdherentsAuthContextFlat()` avec discriminator `ok`.' + NL +
  '  - Le reste (formatDate, Bearer, type-assertions inline, supabase dans tasks.ts) : corrections locales.';

if (s.includes(oldResult)) s = s.replace(oldResult, newResult);

fs.writeFileSync(path, s, 'utf8');
console.log('OK audit.md P2 section updated');
