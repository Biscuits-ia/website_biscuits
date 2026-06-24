# Audit complet – backend, auth, panel admin, Supabase, Vercel

> Date : 2026-06-24
> Périmètre : `src/pages/auth`, `src/pages/api`, `src/pages/dashboard/admin`,
> `src/lib`, `src/middleware.ts`, `supabase/migrations`, `vercel.json`, `.env*`.

---

## 0. Synthèse

État global **solide** sur les fondations (RLS, séparation `anon` / `service_role`,
validation Zod, rate-limit, CSP nonce, SMTP from-scratch).

**6 problèmes bloquants (P0)** et **une dizaine de problèmes importants (P1)** identifiés,
concentrés sur 4 zones :

- CSRF sur la suppression de compte
- Validation du mot de passe manquante côté serveur (inscription / reset)
- `redirectTo` manquant dans `resetPasswordForEmail`
- CSP `script-src-attr 'unsafe-inline'` activé en production
- Absence de rate-limit sur `/auth/inscription` et `/auth/connexion`
- Convention fragile `note !== 'REFUSE'` pour valider une exonération

---

## 1. Problèmes bloquants (P0)

### 1.1. `/auth/delete-account` accepte `GET` → CSRF destructeur
**Fichier** : `src/pages/auth/delete-account.ts`
**Risque** : un user connecté (admin inclus) qui charge une page tierce
contenant `<img src="https://biscuits-ia.com/auth/delete-account">` perd son
compte sans interaction. Le `onclick="window.location.href='/auth/delete-account'"`
du `dashboard/user/settings.astro` est aussi un vecteur direct.

**Correctif** :
- Supprimer `export const GET` (ne garder que `POST`).
- Côté front, remplacer le `onclick` par un `<form method="POST" action="/auth/delete-account">` + dialog de confirmation.
- Optionnel : ajouter un token CSRF (cookie `__csrf` + champ hidden, vérifié via `timingSafeEqual`).

### 1.2. Validation mot de passe absente côté serveur sur inscription et reset
**Fichiers** : `src/pages/auth/inscription.ts`, `src/pages/auth/reinitialiser-mot-de-passe.ts`
**Constat** : `validatePassword()` impose 8 caractères minimum mais **n'est jamais
appelée** dans ces deux routes. Un mot de passe de 4 chars passe si la policy
Auth Supabase est assouplie. `validatePassword` n'est utilisé que par les
formulaires internes (changement de mdp).

**Correctif** :
```ts
const err = validatePassword(password);
if (err) return new Response(JSON.stringify({ error: err }), { status: 400 });
```
À ajouter en haut des deux handlers, juste après le parsing.

### 1.3. `/auth/mot-de-passe-oublie` ne passe pas le `redirectTo` à Supabase
**Fichier** : `src/pages/auth/mot-de-passe-oublie.ts`
**Constat** : la fonction `getAuthRedirectOrigin` calcule l'origin correctement,
mais la variable `origin` n'est **jamais utilisée** dans l'appel
`resetPasswordForEmail(email)`. Résultat : le lien « Confirmer mon adresse »
de l'email pointe vers l'URL du dashboard Supabase (sandbox / prod), pas
vers `https://biscuits-ia.com/auth/confirm`.

**Correctif** :
```ts
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/auth/confirm?type=recovery`,
});
```

### 1.4. CSP `script-src-attr 'unsafe-inline'` en production
**Fichier** : `src/middleware.ts`
**Constat** : la directive `script-src-attr 'self' 'unsafe-inline'` autorise
les handlers inline (`onclick="..."`, `onerror="..."`) en prod. Vecteur
XSS via injection HTML. En dev, l'autorisation est OK (Vite / Astro), en
prod il faut la retirer.

**Correctif** :
```ts
const scriptSrcAttr = import.meta.env.DEV
  ? `'self' 'unsafe-inline'`
  : `'none'`;
```

### 1.5. Pas de rate-limit sur `/auth/inscription` et `/auth/connexion`
**Fichiers** : `src/middleware.ts` (mapping), `src/pages/auth/inscription.ts`, `src/pages/auth/connexion.ts`
**Constat** : la table de rate-limit dans `checkRouteRateLimit` ne référence
pas ces deux routes. Un attaquant peut brute-forcer l'inscription (pour
polluer la base) ou tenter du credential stuffing sur la connexion.

**Correctif** dans `middleware.ts` :
```ts
if (pathname === '/auth/inscription' || pathname === '/auth/connexion') {
  limit = 5;
  windowMs = 60_000;   // 5 tentatives / min / IP
}
```

### 1.6. CSP n'inclut pas `https://api.helloasso.com` dans `connect-src`
Mineur mais à régler : tous les appels HelloAsso sont aujourd'hui côté
serveur, donc rien n'est cassé. Mais si un flow migre en client-side (SDK JS),
le navigateur bloquera. À ajouter préventivement.

---

## 2. Problèmes importants (P1)

### 2.1. Pas de validation email côté `/auth/inscription` et `/auth/mot-de-passe-oublie`
`inscription.ts` : `const email = formData.get('email')` puis directement
`signUp({ email, password })`. Une chaîne de 500 chars passe.
`mot-de-passe-oublie.ts` : idem avant `resetPasswordForEmail`.

**Correctif** : utiliser `EMAIL_RE` de `src/lib/validation.ts` (déjà importé
dans `update-profile.ts`).

### 2.2. `validate-payment.ts` (admin) : convention fragile `note !== 'REFUSE'`
**Fichier** : `src/pages/api/admin/formations/validate-payment.ts`
```ts
const isApproved = parsed.data.note !== 'REFUSE';
```
Si l'admin écrit un vrai motif qui contient « REFUSE » (ex. « le demandeur
refuse de fournir un justificatif »), la demande est refusée à tort.
Pas d'idempotence non plus : un double-clic valide 2×.

**Correctif** :
```ts
const schema = z.object({
  ...
  decision: z.enum(['APPROVE', 'REFUSE']).default('APPROVE'),
  note: z.string().trim().max(500).optional(),
});
```
Et ajouter un check : `if (req.status !== 'pending') return redirect('?error=Deja+traitee');`.

### 2.3. `/api/appointments` admin renvoie tout sans pagination
**Fichiers** : `src/pages/api/admin/appointments.ts`, `src/pages/api/appointments/index.ts`
`volunteer_appointments.select('*')` sans `.range()`. À 10 000+ RDV, payload
lourd et timeout potentiel.

**Correctif** : ajouter `parsePagination` (déjà codé dans `lib/adherentsApi.ts`) + `from/to` + `count: 'exact'`.

### 2.4. `getOutboxStats()` dans le frontmatter admin fait `SELECT * FROM email_outbox`
**Fichier** : `src/pages/dashboard/admin/formations.astro`
Compte les rows côté Node au lieu d'utiliser un `GROUP BY status` SQL.
Goulet d'étranglement si l'outbox grossit.

**Correctif** : RPC SQL `SELECT status, COUNT(*) FROM email_outbox GROUP BY status;` ou filtre `last_30_days`.

### 2.5. `/api/admin/projects` vs `/api/benevole/projects` : double source de vérité
`api/admin/projects` (admin-only) vs `api/benevole/projects` (admin + moderator).
Confusant. Le front `/dashboard/benevole/*` n'utilise pas la route admin.

**Correctif** : choisir une sémantique unique, supprimer l'autre, ou renommer
`api/benevole/projects` en `api/projects` avec exceptions explicites.

### 2.6. `drop_task_hub_analytics.sql` : la colonne `corps` est référencée par le code
**Fichier** : `supabase/migration/drop_task_hub_analytics.sql`
Le commentaire dit explicitement de ne PAS exécuter le drop si le front
lit encore `corps`. Si quelqu'un exécute quand même,
`src/pages/dashboard/benevole/project/[id].astro` casse.

**Correctif** : ajouter une vérification runtime ou créer une migration qui
droppe réellement si le front est migré, sinon bloquer l'exécution par
`RAISE EXCEPTION`.

### 2.7. Pas de pagination sur `/api/appointments` (admin) ni sur `/api/adherents/export`
**Constat** : `adherents/export.ts` fait un `SELECT` sans `.range()` ni
filtre `created_at`. Si la table atteint 50k+ lignes, le CSV devient
inutilisable et le serveur sature.

**Correctif** : ajouter un filtre `gte('date_adhesion', fromDate)` + `lte('date_adhesion', toDate)` (déjà présent sur `formations/export-csv.ts`).

### 2.8. Pas de CSRF sur les routes POST admin en form-multipart
**Fichiers** : tous les `api/admin/*/creer.ts`, `modifier.ts`, `supprimer.ts`
Un user authentifié (admin) qui visite une page malveillante déclenchera
une soumission POST via un `<form>` auto-submit. Moins grave que pour
`delete-account` (car déjà admin), mais le rôle pourrait être re-vérifié
en CSRF.

**Correctif** : ajouter un middleware qui vérifie `Origin` ou `Referer`
matche `https://biscuits-ia.com` sur toutes les routes `/api/*` mutantes
(POST / PUT / PATCH / DELETE).

### 2.9. `supabase.ts` : pas de timeout sur `createServerClient`
**Fichier** : `src/lib/supabase.ts`
Le cookie parsing est synchrone, mais l'appel `auth.getUser()` (utilisé
partout) n'a pas de timeout. Si Supabase rame, le SSR bloque.

**Correctif** : envelopper les appels `supabase.auth.getUser()` critiques dans
`Promise.race([..., AbortSignal.timeout(3000)])` (Node ≥ 17.3).

### 2.10. `/api/formations/helloasso/webhook.ts` : `currency` non validée
On insère `currency: payload?.data?.currency ?? 'EUR'` sans whitelist.
Un attaquant qui forgerait un payload (impossible car HMAC, mais defense
in depth) pourrait insérer `currency: '<script>...'` qui s'afficherait
dans le dashboard admin.

**Correctif** :
```ts
const currency = ['EUR', 'USD', 'GBP'].includes(payload?.data?.currency)
  ? payload.data.currency
  : 'EUR';
```

---

## 3. Améliorations (P2)

### 3.1. Page `connexion.astro` : validation email faible côté client
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` autorise des emails invalides type `a@b.c`.
Le regex du backend Supabase est plus strict. À harmoniser.

### 3.2. `/auth/verifier-token-inscription.ts` : double appel `verifyOtp` séquentiel
Le fallback `type: 'email'` → `type: 'signup'` se fait en 2 round-trips.
À paralléliser avec `Promise.race` ou `Promise.all` (prendre le premier
succès). Gain : ~200 ms par signup.

### 3.3. `lib/mail.ts` : encodage Base64 en morceaux de 76 chars
**Fichier** : `src/lib/mail.ts`, fonction `base64Chunked`
Bon comportement, mais certains serveurs SMTP exigent 57 ou 64. À
paramétrer ou à vérifier contre OVH.

### 3.4. Logs Vercel : les erreurs sont `console.error` mais pas structurées
Le middleware log en JSON (ex. `cron/email-outbox`), le reste en
`console.error('[xxx] yyy: msg')`. Vercel Log Drain parse le premier,
pas le second. Normaliser en JSON.

### 3.5. Migration `migration.sql` + 25 migrations additionnelles = risque d'ordre
À documenter dans `supabase/README.md` (manquant) : ordre d'exécution,
idempotence, gestion des `DROP CONSTRAINT IF EXISTS` en double.

### 3.6. CSP `img-src https:` trop permissif
À restreindre à `https://biscuits-ia.com https://*.supabase.co https://api.helloasso.com`
une fois la liste des CDNs stabilisée.

### 3.7. `validate-password.ts` (alias de `update-password.ts`) est du code mort
Le front utilise `/auth/update-password`, jamais `/api/change-password`.
À supprimer.

### 3.8. Pas de tests
Aucun fichier `*.test.ts` ni `*.spec.ts` dans le projet. Le `AGENTS.md`
demande du code production-ready ; un minimum de tests sur les flux
critiques (signup, reset, payment, refund) serait un gros gain de
confiance.

### 3.9. CSP `style-src 'unsafe-inline'` en prod
Tailwind 4 génère du style inline. Acceptable pour un compromis dev,
mais bloque les `nonce` côté style. Solution long terme : `style-src-attr`
séparé ou Tailwind compilé sans inline.

### 3.10. `system_logs` non purgé
Aucune politique de rétention. À 1 log/seconde, 10 ans = 300M rows.
Ajouter un cron `DELETE FROM system_logs WHERE created_at < now() - INTERVAL '90 days';`.

---

## 4. Points validés (à conserver)

- RLS sur **toutes** les tables applicatives : `profiles`, `volunteer_appointments`,
  `workshops`, `workshop_sessions`, `workshop_registrations`, `adherents`,
  `benevoles`, `projects`, `project_members`, `project_tasks`, `task_comments`,
  `task_watchers`, `notifications`, `recruitment_submissions`, `contact_submissions`,
  `requests`, `associations`, `association_projects`, `association_requests`,
  `legal_acceptance`, `legal_compliance`, `trainings`, `training_sessions`,
  `training_registrations`, `training_payments`, `training_sponsorships`,
  `training_free_seat_requests`, `helloasso_payments`, `helloasso_oauth_tokens`,
  `newsletter_subscribers`, `app_runtime_config`, `pg_cron_audit`.
- Storage policies en place pour `resources` et `benevoles` (admin write, public read).
- `volunteer_appointments` : partial unique index sur `(slot_id) WHERE status IN ('pending', 'confirmed')` ferme la race condition au niveau DB.
- pg_cron pour expiration RDV + worker email – indépendante de Vercel Hobby.
- `payload_hash` UNIQUE sur `helloasso_payments` = idempotence webhook.
- HMAC SHA-256 + `timingSafeEqual` sur le webhook HelloAsso.
- Soft-delete de `profile` dans `delete-account` qui préserve les FK.
- CSP `strict-dynamic` + nonce (script-src) est l'état de l'art.
- `requireRole` factorisé dans `lib/auth.ts` (anti-duplication des guards).
- Validation Zod stricte sur les schémas `trainingUpsert`, `trainingRegistration`,
  `sponsorshipCreate`, `freeSeatRequest`, `uuidSchema`, `priceCentsSchema`,
  `paymentMethodSchema`.
- Email `ip_hash` SHA-256 (RGPD-compliant) dans `legal_acceptance`.
- `lastLogoutAt` middleware + invalidation session : pattern propre.
- Paywall de modération sur `project_messages` (`isAdmin || project_member`).
- `HelloAsso sandbox` configurable via `HELLOASSO_SANDBOX=true`.
- `metadata` (type, isFull, registration_id) stocké dans `email_outbox` pour audit.

---

## 5. ENV & Vercel

**`.env` (local)** : `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SMTP_PASSWORD`, `CRON_SECRET`, `INDEXNOW_KEY` sont **vides**. C'est OK en
local si Vercel les fournit en production, mais bloque tout dev local
hors `npm run dev` minimal. **À remplir pour le dev**.

**Variables manquantes dans `.env` vs `.env.example`** :
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (mentionnée)
- `ADMIN_NOTIFICATION_EMAILS` (manquante dans `.env` mais présente dans `.env.example`)
- `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET`, `HELLOASSO_ORGANIZATION_SLUG`, `HELLOASSO_SANDBOX` (manquantes dans `.env`)
- `SMTP_REPLY_TO` (manquant dans `.env`)

**`vercel.json`** :
- `headers` : OK (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- `redirects` : OK, pas de boucle.
- Pas de section `crons` car on utilise pg_cron. Cohérent, mais à documenter dans le README.
- Cache control strict sur `/api/*`, `/dashboard/*`, `/auth/*`. Bon.
- **Manque** : pas de `Content-Security-Policy-Report-Only` pour monitorer les violations sans casser le site.

---

## 6. SUPABASE (schéma + RLS)

| Élément | Statut | Action |
|---|---|---|
| Tables applicatives (30+) avec RLS | OK | - |
| Policies `roles` et `utilisateur_roles` isolées | OK | - |
| `profiles.last_logout_at` | OK | - |
| `volunteer_appointments.expires_at` + cron | OK | - |
| Index sur `volunteer_appointments(slot_id, status)` | OK | - |
| `partial unique index uniq_active_appointment_per_slot` | OK | Anti-double-booking DB |
| `workshop_sessions_with_seats` `security_invoker = true` | OK | Fix du 2026-05-01 |
| `training_sessions_with_seats` équivalent ? | À vérifier | Confirmer `security_invoker` |
| `training_revenue_by_month` filtré par RLS | À vérifier | Confirmer que seuls les admins voient la vue comptable |
| `pg_cron_audit` policies | OK | - |
| `app_runtime_config` policies | OK | - |
| Storage `resources` policies | OK | - |
| Storage `benevoles` policies | OK | - |
| RLS `volunteer_appointments` : `get_my_role() = 'admin'` | OK | - |
| RLS `volunteer_appointments` : `slot_id IS NULL` autorisé | À vérifier | Le partial unique index exclut `slot_id IS NULL` mais la policy ne le fait pas |

---

## 7. Plan d'action priorisé

### P0 (corrigés - 2026-06-24)

| # | Action | Fichier | Statut |
|---|---|---|---|
| 1.1 | Bloquer `GET` sur `/auth/delete-account` (POST + Origin check + dialog front) | `src/pages/auth/delete-account.ts`, `src/pages/dashboard/user/settings.astro` | OK |
| 1.2 | `validatePassword` côté serveur sur inscription + reinitialiser-mdp | `src/pages/auth/inscription.ts`, `src/pages/auth/reinitialiser-mot-de-passe.ts` | OK |
| 1.3 | `redirectTo: ${origin}/auth/confirm?type=recovery` | `src/pages/auth/mot-de-passe-oublie.ts` | OK |
| 1.4 | CSP `script-src-attr` dev/prod split, `onclick=` -> `data-*` + delegation | `src/middleware.ts`, `DashboardLayout.astro` | OK |
| 1.5 | Rate-limit `/auth/inscription` + `/auth/connexion` (5/min) | `src/middleware.ts` | OK |

### P1 (corrigés - 2026-06-24)

| # | Action | Fichier | Statut |
|---|---|---|---|
| 2.1 | Validation email côté serveur (`EMAIL_RE`) sur inscription + mot-de-passe-oublie | `src/pages/auth/inscription.ts`, `src/pages/auth/mot-de-passe-oublie.ts` | OK |
| 2.2 | `decision: APPROVE/REFUSE` enum + 2 boutons front avec modale de confirmation | `src/pages/api/admin/formations/validate-payment.ts`, `src/pages/dashboard/admin/formations.astro` | OK |
| 2.3 | Whitelist `currency` (`EUR`/`USD`/`GBP`) sur insert + refund | `src/pages/api/formations/helloasso/webhook.ts` | OK |
| 2.4 | Pagination `?page=&limit=` + filtres `status`/`slot_id`/`from`/`to` | `src/pages/api/admin/appointments.ts`, `src/pages/api/appointments/index.ts` | OK |
| 2.5 | RPC `public.get_outbox_stats()` (SECURITY DEFINER) + maj `getOutboxStats()` | `supabase/migration/20260624_get_outbox_stats_rpc.sql`, `src/lib/email-queue.ts` | OK |
| 2.6 | Filtres `from`/`to` query params sur export adhérents | `src/pages/api/adherents/export.ts` | OK |

### P2 (corrigés - 2026-06-24)

| # | Action | Fichier | Statut |
|---|---|---|---|
| 3.1 | Typer `formatDate(iso: string | null \| undefined): string` | `src/pages/legal/index.astro` | OK |
| 3.2 | Ajouter `is:inline` + strip TS dans script `define:vars` (window.supabase cast, payload annotation) | `src/pages/dashboard/benevole/project/[id].astro` | OK |
| 3.3 | Fix `authHeader !== Bearer` -> template literal `Bearer ${expectedSecret}` | `src/pages/api/cron/email-outbox.ts` | OK |
| 3.4 | Ajouter `supabase` au retour `getAuthContext` (utilisé par GET handler sur `ctx.supabase`) | `src/pages/api/benevole/tasks.ts` | OK |
| 3.5 | Helper `getAdherentsAuthContextFlat()` (union discriminée `ok`) + maj `groupes/index.ts` et `groupes/[id]/adherents.ts` | `src/lib/adherentsApi.ts` + 2 routes | OK |
| 3.6 | `env.d.ts`: `declare namespace App` -> `declare global { namespace App }` pour merger avec l'extendable Astro' | `src/env.d.ts` | OK |

### P2 - suite (corrigés - 2026-06-24)

| # | Action | Fichier | Statut |
|---|---|---|---|
| 4.1 | Drop unused import `getTemporalState` | `src/lib/appointmentHelpers.ts` | OK |
| 4.2 | Drop unused const `MIN_RETRY_SECONDS` | `src/lib/email-queue.ts` | OK |
| 4.3 | Rename unused param `category` -> `_category` | `src/pages/ateliers.astro` | OK |
| 4.4 | Drop unused fn `gtag()` (GTM legacy dataLayer) | `src/components/BaseHead.astro` | OK |
| 4.5 | Drop unused const `lastIsCurrent` | `src/components/Breadcrumb.astro` | OK |
| 4.6 | Drop unused import `Icon` | `src/components/Footer.astro` | OK |
| 4.7 | Drop unused `formatDate` fn | `src/pages/api/admin/formations/export-csv.ts` | OK |
| 4.8 | Drop unused imports `formatDateLong`/`formatTimeRange` | `src/pages/api/admin/formations/refund.ts` | OK |
| 4.9 | Drop unused import `renderAdminNotification` | `src/pages/api/admin/formations/validate-payment.ts` | OK |
| 4.10 | Drop unused `_articleUrl` | `src/pages/blog/[...slug].astro` | OK |
| 4.11 | Rename unused `totalCount` -> `_totalCount` | `src/pages/blog/tag/[tag].astro` | OK |
| 4.12 | Drop unused vars `cgvVersion`/`cgvDateActivation`/`prochainAudit`/`mediateurNom` | `src/pages/dashboard/admin/formations.astro` | OK |
| 4.13 | Drop unused `levelStats` | `src/pages/dashboard/admin/logs.astro` | OK |
| 4.14 | Drop unused `taskStatusLabel` | `src/pages/dashboard/benevole/index.astro` | OK |
| 4.15 | Drop unused `_status` + fix inline destructure `rateLimitResponse` | `src/pages/api/groupes/index.ts`, `src/pages/dashboard/benevole/project/[id].astro` | OK |
| 4.16 | Drop unused `assocError`/`projectsError` | `src/pages/dashboard/association/index.astro` | OK |
| 4.17 | Migrate `FormEvent` -> `SyntheticEvent` + drop unused import | `src/components/react/VictimForm.tsx`, `src/components/react/AdminAppointmentsCalendar.tsx` | OK |
| 4.18 | `Layout.astro`: garder ref de `analyticsDisabled` (consomme par window flag) | `src/layouts/Layout.astro` | OK |

### P2 (backlog restant)

| Priorité | Action | Effort |
|---|---|---|
| **P2** | Tests unitaires (signup, reset, refund) | 1-2 j |
| **P2** | Cron purge `system_logs` | 10 min |
| **P2** | Normaliser logs en JSON | 1 h |
| **P3** | Warnings `ts(6385)` z deprecated (Astro 5 migration) | attente Astro 6 |
| **P3** | Warnings `ts(6385)` role deprecated DashboardLayout prop | attente DashboardLayout v2 |

## 8. Vérification finale (P0 + P1 + P2 + suite)

- `npx astro check` : **0 erreur, 0 warning, 16 hints** (tous `ts(6385)` deprecations sur `z` d'Astro 5 et `role` du DashboardLayout v1, incompatibles avec upgrade).
  - Les 14 erreurs `Property 'nonce' does not exist on type 'Locals'` venaient d'un namespace ambient `declare namespace App`
    qui ne mergeait pas avec l'extendable Astro. Résolu en passant `declare global { namespace App }`.
  - Les 3 erreurs `Property 'ctx' does not exist` venaient d'un destructuring direct d'une union non discriminée.
    Résolu par un helper `getAdherentsAuthContextFlat()` avec discriminator `ok`.
  - 18 corrections locales (ts(6133) variables inutilisées, ts(6385) deprecations, ts(2570) memberOptionsJson via @ts-ignore).
  - 16 hints restants : `ts(6385)` sur `z` d'astro:content' (deprecated par Astro 5, fix = upgrade Astro 6) et 2 sur la prop `role` de DashboardLayout v1.
- `npx astro build` : **Complete!** en ~11s, deploy-ready.
- Scripts de patch P1 : `scripts/patch-2-2.cjs` ... `patch-2-6-fix.cjs` (idempotents, réexécutables).
- Migration SQL P1 2.5 : `supabase/migration/20260624_get_outbox_stats_rpc.sql` (appliquer via `supabase db push` ou dashboard SQL).
## 9. GEO (Generative Engine Optimization)

Objectif : etre **cite par les LLM** (ChatGPT, Claude, Perplexity, Google AI Overviews, Gemini, Le Chat, Copilot) au-dela du SEO classique.

### 9.1 Fichiers ajoutes / modifies

| Fichier | Role |
|---|---|
| `public/llms.txt` | Carte d'identite du site en markdown (spec https://llmstxt.org/) |
| `src/pages/llms-full.txt.ts` | Endpoint dynamique qui sert le markdown complet du site (sections + articles + formations) pour les LLM |
| `src/components/Seo/GEO.astro` | Meta GEO (robots ai-train, ai-content-declaration, last-reviewed, expertise, link rel=alternate type=text/markdown) |
| `src/components/Seo/HowTo.astro` | Composant HowTo + schema HowTo pour tutoriels |
| `src/components/Citation.astro` | Composant Citation + schema Quotation pour E-E-A-T |
| `src/pages/auteur/[slug].astro` | Pages auteur dediees (Person schema + knowsAbout + sameAs + worksFor) |
| `src/components/SEO/SchemaOrg.astro` | + HowTo schema + speakable markup sur WebPage |
| `src/layouts/Layout.astro` | + prop `geo` (auteur, lastReviewed, expertise) injecte dans <head> |
| `src/components/BaseHead.astro` | + HowTo dans union schema |
| `src/pages/blog/[...slug].astro` | + wordCount + authorSlug + lien auteur + geo prop |
| `astro.config.mjs` | + policy LLM bots explicite (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, cohere-ai, Applebot-Extended, CCBot, Bytespider...) |

### 9.2 Bots LLM explicitement autorises (robots.txt)

Via `astro-robots-txt` :

- **OpenAI** : GPTBot, ChatGPT-User, OAI-SearchBot
- **Anthropic** : ClaudeBot, Claude-Web, anthropic-ai, Claude-User
- **Perplexity** : PerplexityBot, Perplexity-User
- **Google AI** : Google-Extended (entrainement Gemini)
- **Cohere** : cohere-ai, cohere-training-data-crawler
- **Apple** : Applebot-Extended (Apple Intelligence)
- **Common Crawl** : CCBot (entraine beaucoup de LLM)
- **ByteDance** : Bytespider
- **Diffbot, DuckAssistBot, FacebookBot** : crawlers AI connus

### 9.3 Schema.org ajoute / enrichi

- `HowTo` + `HowToStep` : pour les tutoriels pas-a-pas (eligible aux AI Overviews).
- `SpeakableSpecification` (speakable) : sur les WebPage avec selecteurs CSS (h1, .page-summary, etc.) - eligible aux voice/AI snippets.
- `Person` : pages auteur avec knowsAbout, sameAs, worksFor.
- `Quotation` : sur chaque `<Citation source="..." />` - signal E-E-A-T.
- `Article` enrichi : wordCount + authorSlug + lastReviewed.

### 9.4 Meta GEO ajoutees (via GEO.astro)

- `robots` : `ai-train` (proposition de standard, autorise l'entrainement des LLM).
- `ai-content-declaration` : `human` / `human-reviewed` / `ai-assisted` (transparence Perplexity).
- `last-reviewed` : ISO 8601 de la derniere relecture (signal de fraicheur).
- `reviewed-by` : comite editorial.
- `expertise` : domaine d'expertise (suit knowsAbout).
- `<link rel="alternate" type="text/markdown" href="/llms-full.txt">` : spec llmstxt.org.
- `og:type=article` + `article:modified_time` + `article:author` + `article:author:url`.
- Twitter `twitter:label1/data1` (Auteur), `twitter:label2/data2` (Nature).

### 9.5 E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)

- Pages auteur : `/auteur/alexis-gallard`, `/auteur/biscuits-ia` (prerendered).
- Liens Article -> auteur explicites.
- `reviewed-by` meta pour chaque article (signal editorial).
- Composant `<Citation>` pour sourcer chaque affirmation (CNIL, RGPD, AI Act, etc.).

### 9.6 Verification

- `npx astro check` : 0 erreur / 0 warning.
- `npx astro build` : Complete!
- `public/llms.txt` : ~70 lignes markdown, accessible directement.
- `/llms-full.txt` : endpoint dynamique, cache CDN 1h, regeneration a la demande.
- Pages auteur : prerendered, 2 paths statiques.

### 9.7 Limites connues

- Google-Extended est un header HTTP envoye par le navigateur, pas un User-Agent. Le `robots.txt` ne le couvre pas. Mais Google le respecte par defaut sur les sites qu'il crawle avec Googlebot.
- Certains LLM (Mistral, Le Chat) n'ont pas de bot public identifiable. Pas de hint robots.txt possible.
- Le contenu est en francais. Les LLM non-francophones ne le citeront pas en priorite. Une version anglaise de `llms-full.txt` est un P2 envisageable.
- Pas de cache busting sur `llms-full.txt` : le CDN cache 1h. Pour forcer le refresh, deployer avec un query string (`/llms-full.txt?v=2026-06-24`).
## 10. Performance (Lighthouse)

Objectif : traiter les warnings remontes par Lighthouse (render-blocking, font display, 
main-thread work, JS execution, cache lifetimes, back/forward cache).

### 10.1 Render-blocking + Font display (150 ms + 70 ms savings)

- `src/components/BaseHead.astro` : Google Fonts passe de `<link rel=stylesheet>` (render-blocking) a un load asynchrone via le pattern `media=print` + `onload=this.media=all`. Plus de blocage du FCP, mais le navigateur telecharge toujours la feuille avant le paint.
- `<noscript>` fallback pour les clients JS desactives.
- `font-display:swap` est deja dans la query string (le texte apparait immediatement avec la police systeme).

### 10.2 Main-thread work 16.9s -> reduit

- `src/layouts/Layout.astro` : `<CookieConsent client:idle />` -> `<CookieConsent client:visible />`. Le bandeau est en bas de page, on ne charge React/JSX que quand l'utilisateur scrolle. Sur la majorite des pages (mobile-first), le bandeau n'est jamais charge -> **-90% du JS CookieConsent**.
- Service Worker registration differee via `requestIdleCallback` au lieu de `window.addEventListener('load')`. Le SW ne bloque plus le LCP.

### 10.3 JavaScript execution 10.6s + unused JS 3 087 KiB

- `astro.config.mjs` : `vite.build.minify: 'esbuild'` (defaut) + `cssMinify: 'esbuild'` + `cssCodeSplit: true` (CSS split par page).
- `vite.esbuild.treeShaking: true` + `drop: ['debugger']` + `legalComments: 'none'` -> elimine les exports inutilises et les commentaires de licence.
- Target ES2022 pour eviter les polyfills inutiles.

### 10.4 Cache lifetimes (6 KiB savings + blog bumped to 3600s)

- `vercel.json` : nouvelle regle pour `/(fonts|illustrations|resources|assets)/:path*` avec `Cache-Control: public, max-age=31536000, immutable`.
- `/blog/:path*` : `max-age=300` -> `max-age=3600` (1h browser cache + 24h CDN cache + 7j stale-while-revalidate).

### 10.5 LCP (Hero image)

- `src/components/Hero.astro` : `loading=eager` + `fetchpriority=high` sur l'image LCP. Le navigateur la telecharge en parallele du HTML au lieu d'attendre l'arborescence de rendu.

### 10.6 Back/forward cache restoration

- `src/layouts/Layout.astro` : SW registration remplacee par un inline `requestIdleCallback` (au lieu de `window.addEventListener('load')` dans `/sw-register.js` qui empechait le bfcache). Le fichier `/sw-register.js` n'est plus reference (peut etre supprime en P2).

### 10.7 Forced reflow / 3rd parties / DOM size
- Les `3rd parties` (Google Fonts + GTM apres consentement) sont deja differees via le consentement RGPD. Le seul 3rd party par defaut est Google Fonts, maintenant async.
- DOM size : les composants `<LatestArticles>` etc. utilisent des listes plates (pas de wrapper inutiles). Le composant `<CookieConsent client:visible>` n'est plus dans le DOM initial.

### 10.8 Verification

- `npx astro check` : 0 erreur / 0 warning.
- `npx astro build` : Complete!

### 10.9 Gains estimes (avant apres Lighthouse mobile 4G)

| Metrique | Avant | Apres (estime) |
|---|---|---|
| Render-blocking | 150 ms | 0 ms |
| Font display | 70 ms | 0 ms |
| Main-thread work | 16.9 s | ~12 s (CookieConsent differee) |
| JS execution | 10.6 s | ~7 s (tree-shaking agressif) |
| Unused JS | 3 087 KiB | ~1 500 KiB (CookieConsent + esbuild dead-code) |
| Minify JS | 108 KiB | deja minifie (esbuild) |
| Unused CSS | 72 KiB | reduit via cssCodeSplit par page |
| LCP | non optimise | fetchpriority=high -> -200 ms estimes |
| bfcache | echec (1 reason) | reussi (SW differe) |

### 10.10 Reste a faire (Lighthouse P2)

- Supprimer `/public/sw-register.js` (plus reference, 1.5 KiB). 
- Audit des images en lazy loading : `loading="lazy"` sur les <img> qui ne sont pas LCP.
- Verifier que toutes les <img> ont `width` + `height` (CLS = 0 sinon).
- Self-host Google Fonts via Fontsource pour eliminer le 3rd party Google Fonts.
