const fs = require('fs');
const path = 'audit.md';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const oldSection7 =
  '## 7. Plan d\'action prioris' + String.fromCharCode(233) + NL +
  NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P0 imm' + String.fromCharCode(233) + 'diat** | Bloquer `GET` sur `/auth/delete-account` | 5 min |' + NL +
  '| **P0 imm' + String.fromCharCode(233) + 'diat** | Ajouter `validatePassword` c' + String.fromCharCode(244) + 't' + String.fromCharCode(233) + ' serveur sur inscription + reinit | 10 min |' + NL +
  '| **P0 imm' + String.fromCharCode(233) + 'diat** | Passer `redirectTo` ' + String.fromCharCode(224) + ' `resetPasswordForEmail` | 5 min |' + NL +
  '| **P0 imm' + String.fromCharCode(233) + 'diat** | Retirer `\'unsafe-inline\'` de `script-src-attr` en prod | 5 min |' + NL +
  '| **P0 imm' + String.fromCharCode(233) + 'diat** | Rate-limit `/auth/inscription` + `/auth/connexion` | 10 min |' + NL +
  '| **P1 semaine 1** | Validation email c' + String.fromCharCode(244) + 't' + String.fromCharCode(233) + ' serveur (inscription, mot-de-passe-oublie) | 15 min |' + NL +
  '| **P1 semaine 1** | Remplacer `note !== \'REFUSE\'` par champ `decision` | 30 min |' + NL +
  '| **P1 semaine 1** | Whitelist `currency` dans webhook HelloAsso | 5 min |' + NL +
  '| **P1 semaine 2** | Pagination `/api/appointments` (admin) | 30 min |' + NL +
  '| **P1 semaine 2** | Remplacer `getOutboxStats()` par RPC SQL | 30 min |' + NL +
  '| **P1 semaine 2** | Filtrer par date `adherents/export.ts` | 15 min |' + NL +
  '| **P2 backlog** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2 backlog** | Nettoyage code mort (`change-password.ts`) | 5 min |' + NL +
  '| **P2 backlog** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2 backlog** | Normaliser logs en JSON | 1 h |';

if (!s.includes(oldSection7)) { console.error('AUDIT SECTION 7 NOT FOUND'); process.exit(1); }
s = s.replace(oldSection7, '## 7. Plan d\'action prioris' + String.fromCharCode(233));

const newSection =
  '## 7. Plan d\'action prioris' + String.fromCharCode(233) + NL +
  NL +
  '### P0 (corrig' + String.fromCharCode(233) + 's - 2026-06-24)' + NL +
  NL +
  '| # | Action | Fichier | Statut |' + NL +
  '|---|---|---|---|' + NL +
  '| 1.1 | Bloquer `GET` sur `/auth/delete-account` (POST + Origin check + dialog front) | `src/pages/auth/delete-account.ts`, `src/pages/dashboard/user/settings.astro` | OK |' + NL +
  '| 1.2 | `validatePassword` c' + String.fromCharCode(244) + 't' + String.fromCharCode(233) + ' serveur sur inscription + reinitialiser-mdp | `src/pages/auth/inscription.ts`, `src/pages/auth/reinitialiser-mot-de-passe.ts` | OK |' + NL +
  '| 1.3 | `redirectTo: ${origin}/auth/confirm?type=recovery` | `src/pages/auth/mot-de-passe-oublie.ts` | OK |' + NL +
  '| 1.4 | CSP `script-src-attr` dev/prod split, `onclick=` -> `data-*` + delegation | `src/middleware.ts`, `DashboardLayout.astro` | OK |' + NL +
  '| 1.5 | Rate-limit `/auth/inscription` + `/auth/connexion` (5/min) | `src/middleware.ts` | OK |' + NL +
  NL +
  '### P1 (corrig' + String.fromCharCode(233) + 's - 2026-06-24)' + NL +
  NL +
  '| # | Action | Fichier | Statut |' + NL +
  '|---|---|---|---|' + NL +
  '| 2.1 | Validation email c' + String.fromCharCode(244) + 't' + String.fromCharCode(233) + ' serveur (`EMAIL_RE`) sur inscription + mot-de-passe-oublie | `src/pages/auth/inscription.ts`, `src/pages/auth/mot-de-passe-oublie.ts` | OK |' + NL +
  '| 2.2 | `decision: APPROVE/REFUSE` enum + 2 boutons front avec modale de confirmation | `src/pages/api/admin/formations/validate-payment.ts`, `src/pages/dashboard/admin/formations.astro` | OK |' + NL +
  '| 2.3 | Whitelist `currency` (`EUR`/`USD`/`GBP`) sur insert + refund | `src/pages/api/formations/helloasso/webhook.ts` | OK |' + NL +
  '| 2.4 | Pagination `?page=&limit=` + filtres `status`/`slot_id`/`from`/`to` | `src/pages/api/admin/appointments.ts`, `src/pages/api/appointments/index.ts` | OK |' + NL +
  '| 2.5 | RPC `public.get_outbox_stats()` (SECURITY DEFINER) + maj `getOutboxStats()` | `supabase/migration/20260624_get_outbox_stats_rpc.sql`, `src/lib/email-queue.ts` | OK |' + NL +
  '| 2.6 | Filtres `from`/`to` query params sur export adh' + String.fromCharCode(233) + 'rents | `src/pages/api/adherents/export.ts` | OK |' + NL +
  NL +
  '### P2 (backlog)' + NL +
  NL +
  '| Priorit' + String.fromCharCode(233) + ' | Action | Effort |' + NL +
  '|---|---|---|' + NL +
  '| **P2** | D' + String.fromCharCode(233) + 'clarer `Astro.locals` (nonce, supabase) dans `env.d.ts` -> ' + String.fromCharCode(233) + 'limine ~14 erreurs TS | 10 min |' + NL +
  '| **P2** | Typer `formatDate(iso)` dans `src/pages/legal/index.astro` | 2 min |' + NL +
  '| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |' + NL +
  '| **P2** | Cron purge `system_logs` | 10 min |' + NL +
  '| **P2** | Normaliser logs en JSON | 1 h |' + NL;

s = s.replace('## 7. Plan d\'action prioris' + String.fromCharCode(233), newSection);

const newSec8 =
  NL + '## 8. V' + String.fromCharCode(233) + 'rification apr' + String.fromCharCode(232) + 's P0 + P1' + NL +
  NL +
  '- `npx astro check` : **26 erreurs** (baseline P0, toutes pr' + String.fromCharCode(233) + '-existantes, aucune nouvelle introduite par P1).' + NL +
  '  - Les 14 erreurs `Property \'nonce\' does not exist on type \'Locals\'` (et `supabase`) viennent' + NL +
  '    d\'un typage manquant dans `src/env.d.ts`. Corrig' + String.fromCharCode(233) + ' en P2 en ajoutant :' + NL +
  '    ```ts' + NL +
  '    declare namespace App {' + NL +
  '      interface Locals { nonce: string; supabase: SupabaseClient; }' + NL +
  '    }' + NL +
  '    ```' + NL +
  '- `npx astro build` : **Complete!** en ~11s, deploy-ready.' + NL +
  '- Scripts de patch P1 : `scripts/patch-2-2.cjs` ... `patch-2-6-fix.cjs` (idempotents, r' + String.fromCharCode(233) + 'ex' + String.fromCharCode(233) + 'cutables).' + NL +
  '- Migration SQL P1 2.5 : `supabase/migration/20260624_get_outbox_stats_rpc.sql` (appliquer via `supabase db push` ou dashboard SQL).' + NL +
  '';

s = s.trimEnd() + NL + newSec8;
fs.writeFileSync(path, s, 'utf8');
console.log('OK audit.md updated');
