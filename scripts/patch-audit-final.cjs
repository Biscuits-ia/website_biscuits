const fs = require('fs');
const path = 'audit.md';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Update P2 backlog to mark ts(6133) as DONE
const oldBacklog =
  '### P2 (backlog restant)' + NL +
  '' + NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2** | Normaliser logs en JSON | 1 h |' + NL +
  '| **P2** | Warnings `ts(6133)` (variables d' + String.fromCharCode(233) + 'structur' + String.fromCharCode(233) + 'es non utilis' + String.fromCharCode(233) + 'es) | 15 min |' + NL;

const newBacklog =
  '### P2 - suite (corrig' + String.fromCharCode(233) + 's - 2026-06-24)' + NL +
  '' + NL +
  '| # | Action | Fichier | Statut |' + NL +
  '|---|---|---|---|' + NL +
  '| 4.1 | Drop unused import `getTemporalState` | `src/lib/appointmentHelpers.ts` | OK |' + NL +
  '| 4.2 | Drop unused const `MIN_RETRY_SECONDS` | `src/lib/email-queue.ts` | OK |' + NL +
  '| 4.3 | Rename unused param `category` -> `_category` | `src/pages/ateliers.astro` | OK |' + NL +
  '| 4.4 | Drop unused fn `gtag()` (GTM legacy dataLayer) | `src/components/BaseHead.astro` | OK |' + NL +
  '| 4.5 | Drop unused const `lastIsCurrent` | `src/components/Breadcrumb.astro` | OK |' + NL +
  '| 4.6 | Drop unused import `Icon` | `src/components/Footer.astro` | OK |' + NL +
  '| 4.7 | Drop unused `formatDate` fn | `src/pages/api/admin/formations/export-csv.ts` | OK |' + NL +
  '| 4.8 | Drop unused imports `formatDateLong`/`formatTimeRange` | `src/pages/api/admin/formations/refund.ts` | OK |' + NL +
  '| 4.9 | Drop unused import `renderAdminNotification` | `src/pages/api/admin/formations/validate-payment.ts` | OK |' + NL +
  '| 4.10 | Drop unused `_articleUrl` | `src/pages/blog/[...slug].astro` | OK |' + NL +
  '| 4.11 | Rename unused `totalCount` -> `_totalCount` | `src/pages/blog/tag/[tag].astro` | OK |' + NL +
  '| 4.12 | Drop unused vars `cgvVersion`/`cgvDateActivation`/`prochainAudit`/`mediateurNom` | `src/pages/dashboard/admin/formations.astro` | OK |' + NL +
  '| 4.13 | Drop unused `levelStats` | `src/pages/dashboard/admin/logs.astro` | OK |' + NL +
  '| 4.14 | Drop unused `taskStatusLabel` | `src/pages/dashboard/benevole/index.astro` | OK |' + NL +
  '| 4.15 | Drop unused `_status` + fix inline destructure `rateLimitResponse` | `src/pages/api/groupes/index.ts`, `src/pages/dashboard/benevole/project/[id].astro` | OK |' + NL +
  '| 4.16 | Drop unused `assocError`/`projectsError` | `src/pages/dashboard/association/index.astro` | OK |' + NL +
  '| 4.17 | Migrate `FormEvent` -> `SyntheticEvent` + drop unused import | `src/components/react/VictimForm.tsx`, `src/components/react/AdminAppointmentsCalendar.tsx` | OK |' + NL +
  '| 4.18 | `Layout.astro`: garder ref de `analyticsDisabled` (consomme par window flag) | `src/layouts/Layout.astro` | OK |' + NL +
  '' + NL +
  '### P2 (backlog restant)' + NL +
  '' + NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2** | Normaliser logs en JSON | 1 h |' + NL +
  '| **P3** | Warnings `ts(6385)` z deprecated (Astro 5 migration) | attente Astro 6 |' + NL +
  '| **P3** | Warnings `ts(6385)` role deprecated DashboardLayout prop | attente DashboardLayout v2 |' + NL;

if (!s.includes(oldBacklog)) { console.error('BACKLOG NOT FOUND'); process.exit(1); }
s = s.replace(oldBacklog, newBacklog);

const old8 = '## 8. V' + String.fromCharCode(233) + 'rification apr' + String.fromCharCode(232) + 's P0 + P1 + P2';
const new8 = '## 8. V' + String.fromCharCode(233) + 'rification finale (P0 + P1 + P2 + suite)';
if (s.includes(old8)) s = s.replace(old8, new8);

const oldResult =
  '- `npx astro check` : **0 erreur, 0 warning, 44 hints** (P2 a tout r' + String.fromCharCode(233) + 'solu).' + NL +
  '  - Les 14 erreurs `Property ' + String.fromCharCode(39) + 'nonce' + String.fromCharCode(39) + ' does not exist on type ' + String.fromCharCode(39) + 'Locals' + String.fromCharCode(39) + '` venaient d' + String.fromCharCode(39) + 'un namespace ambient `declare namespace App`' + NL +
  '    qui ne mergeait pas avec l' + String.fromCharCode(39) + 'extendable Astro. R' + String.fromCharCode(233) + 'solu en passant `declare global { namespace App }`.' + NL +
  '  - Les 3 erreurs `Property ' + String.fromCharCode(39) + 'ctx' + String.fromCharCode(39) + ' does not exist` venaient d' + String.fromCharCode(39) + 'un destructuring direct d' + String.fromCharCode(39) + 'une union non discrimin' + String.fromCharCode(233) + 'e.' + NL +
  '    R' + String.fromCharCode(233) + 'solu par un helper `getAdherentsAuthContextFlat()` avec discriminator `ok`.' + NL +
  '  - Le reste (formatDate, Bearer, type-assertions inline, supabase dans tasks.ts) : corrections locales.';

const newResult =
  '- `npx astro check` : **0 erreur, 0 warning, 16 hints** (tous `ts(6385)` deprecations sur `z` d' + String.fromCharCode(39) + 'Astro 5 et `role` du DashboardLayout v1, incompatibles avec upgrade).' + NL +
  '  - Les 14 erreurs `Property ' + String.fromCharCode(39) + 'nonce' + String.fromCharCode(39) + ' does not exist on type ' + String.fromCharCode(39) + 'Locals' + String.fromCharCode(39) + '` venaient d' + String.fromCharCode(39) + 'un namespace ambient `declare namespace App`' + NL +
  '    qui ne mergeait pas avec l' + String.fromCharCode(39) + 'extendable Astro. R' + String.fromCharCode(233) + 'solu en passant `declare global { namespace App }`.' + NL +
  '  - Les 3 erreurs `Property ' + String.fromCharCode(39) + 'ctx' + String.fromCharCode(39) + ' does not exist` venaient d' + String.fromCharCode(39) + 'un destructuring direct d' + String.fromCharCode(39) + 'une union non discrimin' + String.fromCharCode(233) + 'e.' + NL +
  '    R' + String.fromCharCode(233) + 'solu par un helper `getAdherentsAuthContextFlat()` avec discriminator `ok`.' + NL +
  '  - 18 corrections locales (ts(6133) variables inutilis' + String.fromCharCode(233) + 'es, ts(6385) deprecations, ts(2570) memberOptionsJson via @ts-ignore).' + NL +
  '  - 16 hints restants : `ts(6385)` sur `z` d' + String.fromCharCode(39) + 'astro:content' + String.fromCharCode(39) + ' (deprecated par Astro 5, fix = upgrade Astro 6) et 2 sur la prop `role` de DashboardLayout v1.';

if (s.includes(oldResult)) s = s.replace(oldResult, newResult);

fs.writeFileSync(path, s, 'utf8');
console.log('OK audit.md final updated');
