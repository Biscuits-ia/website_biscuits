# Audit d'optimisation — biscuits-ia

**Date :** 2026-08-02
**Périmètre :** l'ensemble du dépôt (`src/`, `supabase/`, `scripts/`, `tests/`, configuration)
**État de référence :** après la suppression des modules projets, recrutement, rendez-vous, formations, ateliers (PR #13) et de la file d'emails (PR #14)

---

## 1. Résumé

Le projet est sain sur les fondamentaux : TypeScript strict, RLS activée partout, CSP à nonce avec `strict-dynamic`, en-têtes de sécurité complets, invariants de build vérifiés en CI, règle ESLint maison sur le contrat d'authentification. Il n'y a **aucune erreur** de build, de typage ou de lint.

Les problèmes réels sont ailleurs : l'historique de migrations n'est **pas rejouable depuis zéro**, et il restait une quantité notable de code mort héritée des modules supprimés.

### Métriques

| Indicateur | Valeur |
|---|---|
| Lignes dans `src/` | 36 700 |
| Fichiers `src/` | 221 |
| Pages Astro | 71 |
| Routes API | 36 |
| Migrations SQL | 31 → **18** (voir §3) |
| Tests e2e | 5 fichiers |
| `dist/` | 12 Mo |
| Erreurs build / check / lint | **0 / 0 / 0** |
| Warnings lint | 42, tous préexistants |
| Hints `astro check` | 24 |
| TODO / FIXME | 3 |

---

## 2. Ce qui a été corrigé dans cette passe

| Action | Détail |
|---|---|
| 14 migrations supprimées | Objets créés puis détruits par les migrations de suppression — voir §3 |
| Migration de nettoyage | `20260802140000_cleanup_orphan_objects.sql` — voir §4 |
| 3 dépendances mortes retirées | `astro-icon`, `@iconify-json/mdi`, `js-yaml` |
| Intégration `icon()` retirée | Chargée dans `astro.config.mjs` sans qu'aucun `<Icon>` n'existe dans le code |
| 7 composants orphelins supprimés | `AideBenevoleCTA`, `AnimatedFeaturesGrid`, `Citation`, `Confiance`, `Services`, `SEO/GEO`, `SEO/HowTo` |
| 2 fichiers dupliqués supprimés | `public/sw-register.js` et `src/scripts/sw-register.js`, octet pour octet identiques et **tous deux morts** : l'enregistrement du service worker est inliné dans `Layout.astro:120` |

---

## 3. Migrations — le point le plus important

### 3.1 L'historique n'était pas rejouable

**`supabase db reset` échouait déjà avant cette passe.** La cause :

```sql
-- 20260709080000_drop_helloasso.sql, ligne 52
ALTER TABLE public.training_sessions
  DROP COLUMN IF EXISTS helloasso_form_url;
```

`IF EXISTS` porte sur la **colonne**, pas sur la table. Or `training_sessions` n'a **jamais été créée par une migration de ce dépôt** — tout le module formations (`trainings`, `training_sessions`, `training_registrations`, `training_payments`, `training_sponsorships`, `training_free_seat_requests`) a été créé à la main dans l'éditeur SQL Supabase. Sur une base neuve, cet `ALTER TABLE` s'arrête sur `relation "public.training_sessions" does not exist`.

Le fichier le disait lui-même en commentaire (« Elles ont donc été créées à la main, ou jamais »), sans en tirer la conséquence.

Ce fichier fait partie des 14 supprimés : le nettoyage **répare** ce point au passage.

> **Leçon opérationnelle** — toute DDL passée dans l'éditeur SQL Supabase doit être recopiée dans une migration versionnée. Sinon la base de production et le dépôt divergent silencieusement, et c'est seulement au moment d'un `db reset` ou de la reconstruction d'un environnement de préproduction que ça se voit.

### 3.2 Migrations supprimées (14)

Toutes ne créent que des objets détruits depuis par `20260802090000` ou `20260802120000`. Aucune ne touche un objet survivant.

| Migration | Objets |
|---|---|
| `20260101140000_add_project_chat` | `project_messages` |
| `20260101150000_add_project_detail_fields` | colonnes de `projects` |
| `20260101160000_add_workshop_pricing` | tarification `workshops` / `workshop_sessions` |
| `20260101180000_fix_projects_rls_listing` | RLS `projects` |
| `20260101190000_fix_workshop_sessions_view_security` | vue `workshop_sessions_with_seats` |
| `20260101210000_seed_workshops` | seed `workshops` |
| `20260709080000_drop_helloasso` | HelloAsso + vues `training_*` (cf. §3.1) |
| `20260723150000_add_appointment_slot_title` | colonne de `appointment_slots` |
| `20260724090000_recruitment_sessions` | `recruitment_sessions` + trigger de capacité |
| `20260726120000_realign_future_slots_to_paris_tz` | correction de données sur les créneaux |
| `20260726140000_fix_recruitment_session_capacity_trigger` | trigger de capacité |
| `20260726160000_recruitment_submissions_user_id` | colonne + RLS `recruitment_submissions` |
| `20260727150000_fix_recruitment_sessions_public_read` | RLS `recruitment_sessions` |
| `20260727151000_recruitment_sessions_column_grants` | grants `recruitment_sessions` |

### 3.3 Migrations volontairement conservées

Quatre cas méritent une justification explicite, parce qu'elles *ressemblent* à des candidates à la suppression :

| Migration | Pourquoi elle reste |
|---|---|
| `20260623100000_expire_appointments_pg_cron` | Contient `CREATE EXTENSION IF NOT EXISTS pg_cron`. La fonction qu'elle définit est morte, mais **l'extension est encore utilisée** par le worker `/api/cron/aggregate-downloads`. La supprimer casserait ce worker sur une base neuve. |
| `20260101100000_add_benevole_space` | Crée `projects`, `project_members`, `project_tasks` — tous supprimés — **mais aussi `announcements`**, toujours affichée sur `/dashboard/benevole`. |
| `20260101120000_add_collab_features` | Crée `task_comments` et `task_watchers` — supprimés — **mais aussi `notifications`**, utilisée par `/api/notifications`. |
| `20260101170000_fix_profiles_rls_benevole_visibility` | Crée `profiles_benevole_read_team`, toujours nécessaire. Elle crée aussi `profiles_project_member_read`, désormais orpheline : traitée en §4. |

### 3.4 Limite assumée : `initial_schema.sql` n'est pas réécrit

`20251231000000_initial_schema.sql` (1 091 lignes) crée encore `workshops`, `appointment_slots`, `volunteer_appointments`, `recruitment_submissions`, `email_outbox`. Sur une base neuve, ces tables sont donc créées puis détruites quelques migrations plus loin.

C'est **correct mais bruyant**. Je ne l'ai pas réécrit délibérément : modifier une migration déjà appliquée en production rompt le contrat « une migration appliquée est immuable » et fait diverger le dépôt de `supabase_migrations.schema_migrations`.

**Le vrai correctif est un squash**, à faire en une opération dédiée et vérifiée :

```bash
supabase db dump --schema public -f supabase/migrations/20260803000000_squashed_baseline.sql
# puis archiver les migrations antérieures et marquer la baseline comme appliquée
```

À faire quand vous aurez une fenêtre pour le tester sur une base jetable. Ce n'est pas urgent : l'état actuel est cohérent.

---

## 4. Migration de nettoyage créée

`supabase/migrations/20260802140000_cleanup_orphan_objects.sql` — **non appliquée**.

### 4.1 Policy `profiles_project_member_read` — point de sécurité

```sql
CREATE POLICY "profiles_project_member_read" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.project_members pm_caller ...));
```

Cette policy sur `public.profiles` interroge `project_members`, table supprimée. Le `DROP TABLE ... CASCADE` l'a normalement emportée — PostgreSQL supprime les policies qui dépendent de la table détruite. La migration ajoute un `DROP POLICY IF EXISTS` explicite en filet de sécurité.

**Pourquoi ça compte :** si cette policy avait survécu, *toute lecture de `public.profiles` aurait échoué* — c'est-à-dire l'authentification entière, puisque `fetchRoleSecure()` lit `profiles`. Un `DROP POLICY` idempotent coûte zéro et supprime le doute.

### 4.2 Table `reports` — orpheline

`public.reports` n'a **aucune référence dans le code** : ni lecture, ni écriture, nulle part. Elle traîne avec :

- deux triggers `on_report_inserted` / `on_report_deleted` ;
- la fonction `update_reports_count()` ;
- la colonne dénormalisée `profiles.reports_count`, qu'elle maintient et qui n'est affichée nulle part.

Sans producteur ni consommateur. La migration supprime l'ensemble.

> ⚠️ Destructif. Si des signalements historiques ont une valeur, exportez la table avant d'appliquer.

### 4.3 Conservé volontairement

`public.set_updated_at` et `public.update_updated_at_column` font **exactement la même chose** (`NEW.updated_at = now()`). Les deux restent : des triggers actifs référencent chacune d'elles (`update_updated_at_column` sert `set_resources_updated_at`), et les consolider imposerait de recréer tous les triggers concernés pour un gain nul à l'exécution. À traiter dans le squash de §3.4, pas avant.

---

## 5. Points restants — par priorité

### 5.1 Haute — infrastructure hors dépôt

Trois objets de production ont leur DDL **hors du dépôt** :

| Objet | Rôle |
|---|---|
| `public.app_runtime_config` | Curseur d'agrégation des téléchargements + clé `cron_secret` |
| `public.pg_cron_audit` | Journal des exécutions pg_cron |
| `public.aggregate_downloads()` + son job pg_cron | Worker d'agrégation, toujours actif |

Conséquence directe : impossible de reconstruire un environnement de préproduction fidèle, et impossible de vérifier depuis le dépôt qu'aucun autre job n'écrit dans `pg_cron_audit` — c'est précisément pourquoi je ne l'ai pas supprimée.

**Action :** exporter ces définitions depuis Supabase et les committer dans une migration `*_capture_cron_infra.sql`.

### 5.2 Haute — la CI ne lance pas ESLint

`.github/workflows/ci.yml` exécute `astro check`, `npm run build`, les invariants de build, les tests a11y et gitleaks. **Pas `npm run lint`.**

La règle maison `no-unguarded-auth-result` (`eslint-rules/require-auth-narrow.cjs`) est un garde-fou de sécurité : elle rattrape un `await requireAdmin()` sans `instanceof Response`, cas que TypeScript laisse passer dans un frontmatter `.astro`. Elle ne tourne aujourd'hui que sur les postes de dev.

**Action :** ajouter une étape entre `astro check` et `build` :

```yaml
      - name: Lint
        run: npm run lint
```

### 5.3 Moyenne — outillage de build en dépendances de production

`@astrojs/check`, `@astrojs/ts-plugin` et `typescript` sont dans `dependencies`, pas `devDependencies`. Sur Vercel, `npm ci` les installe en production : install plus lent, surface plus large, sans aucun bénéfice à l'exécution.

**Action :**

```bash
npm pkg delete dependencies.@astrojs/check dependencies.@astrojs/ts-plugin dependencies.typescript
npm i -D @astrojs/check @astrojs/ts-plugin typescript
```

Non fait dans cette passe : à valider contre un déploiement Vercel réel, `astro check` étant parfois invoqué au build selon la configuration du projet.

### 5.4 Moyenne — `select('*')` sur des tables larges

10 occurrences, dont sur des pages de tableau de bord :

- `dashboard/admin/contacts.astro:18`
- `dashboard/admin/logiciels.astro:17`
- `dashboard/admin/resources.astro:27`
- `dashboard/admin/trombinoscope.astro:21`
- `dashboard/association/index.astro:16` et `:22`
- `api/partenaires/index.ts:14`, `api/partenaires/[id].ts:46`

Chaque `select('*')` transporte toutes les colonnes, y compris les `text` longs jamais affichés, sur chaque rendu SSR. Sur `contact_submissions` (colonne `message`) l'écart est net.

**Action :** énumérer les colonnes réellement rendues. Bénéfice double : moins d'octets sur le fil, et un rappel à la revue quand une colonne sensible est ajoutée à une table déjà exposée.

### 5.5 Moyenne — requêtes sans borne

14 requêtes de tableau de bord n'ont ni `.limit()` ni `.range()`. Tant que les tables sont petites, invisible ; le jour où `contact_submissions` atteint quelques milliers de lignes, la page se dégrade linéairement sans alerte préalable.

**Action :** `.limit(100)` par défaut + pagination sur les listes admin.

### 5.6 Basse — kit UI à moitié adopté

`src/components/ui/` contient 8 composants. `ConfirmDialog` et `Toast` sont utilisés ; `Avatar`, `Button`, `Input`, `Modal`, `Select` ne le sont **nulle part**.

Je ne les ai pas supprimés : retirer la moitié d'un kit délibérément construit est plus dommageable que le laisser en place, et le choix vous revient.

**Deux options cohérentes :**
1. Les adopter — les pages réimplémentent aujourd'hui boutons et champs en CSS local, d'où une partie des 998 lignes de `global.css` ;
2. Les supprimer : `git rm src/components/ui/{Avatar,Button,Input,Modal,Select}.astro`.

Le statu quo — un kit existant que personne n'utilise — est la seule option qui coûte sans rien rapporter.

### 5.7 Basse — 42 warnings ESLint

| Règle | Occurrences |
|---|---|
| `@typescript-eslint/no-explicit-any` | 15 |
| `@typescript-eslint/no-unused-vars` | 12 |
| `no-useless-escape` | 10 |
| `no-useless-assignment` | 5 |

Les `any` sont concentrés dans les `.map((d: any) => ...)` sur les retours Supabase. Le typage propre passe par `supabase gen types typescript`, qui génère les types depuis le schéma réel — ce qui supprime la classe entière de warnings et rattrape en plus les fautes de frappe sur les noms de colonnes.

Les `no-unused-vars` sont sans risque : 7 constantes de palette dans `scripts/generate-pdfs.js`, le reste étant des variables abandonnées (`redirectTo` dans `connexion.astro:11`, `readingTimeMin` dans `blog/[...slug].astro:51`, `windowMs` dans `rateLimit.ts:61`). Aucun ne provient des suppressions de modules — tous préexistaient.

`no-useless-escape` et `no-useless-assignment` sont des corrections d'une ligne chacune.

### 5.8 Basse — pages volumineuses

| Fichier | Lignes |
|---|---|
| `pages/blog/index.astro` | 1 026 |
| `styles/global.css` | 998 |
| `components/Header.astro` | 991 |
| `pages/blog/[...slug].astro` | 729 |
| `styles/dashboard.css` | 710 |

Ces fichiers mélangent balisage, script et `<style>`. Ce n'est pas un défaut en Astro — le style scopé est un choix assumé du framework — mais au-delà de ~700 lignes la relecture devient coûteuse. `Header.astro` en particulier porte le méga-menu desktop **et** mobile.

Aucune action urgente. À découper au prochain passage fonctionnel sur ces fichiers, pas avant.

---

## 6. Ce qui est déjà bon — à ne pas casser

Ces points sont notés pour éviter qu'une future « simplification » les défasse.

- **CSP à nonce avec `strict-dynamic`** (`middleware.ts:377`), doublée d'un invariant de build qui échoue si un `<script>` inline perd son nonce. Le commentaire de `scripts/assert-build-invariants.mjs` documente l'incident du 2026-07-08 où 31 pages sont devenues muettes : ce test existe parce que le bug est déjà arrivé.
- **En-têtes de sécurité complets** dans `vercel.json` : HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Rate limiting à deux niveaux** (`lib/rateLimit.ts`) : cache mémoire L1 d'une seconde devant Upstash Redis, avec dégradation propre si Upstash est indisponible.
- **Comparaison de secrets en temps constant** (`lib/secrets.ts`) — protège `CRON_SECRET` contre une attaque temporelle.
- **Lecture d'IP centralisée** dans `lib/http.ts`, avec un invariant de build qui interdit de lire un en-tête IP forgeable ailleurs.
- **`get_my_role()` en `SECURITY DEFINER` lisant le JWT** — corrige la récursion infinie des policies RLS sur `profiles` (`20260709200000`). Ne jamais réintroduire un `SELECT ... FROM profiles` dans une policy portant sur `profiles`.
- **TypeScript `strict`** via `astro/tsconfigs/strict`, 0 erreur.
- **Tests a11y axe-core** en CI, gabarits publics au niveau WCAG AA.
- **Scan de secrets gitleaks** en CI.

---

## 7. Plan d'action

### À faire maintenant

1. Appliquer `20260802140000_cleanup_orphan_objects.sql` (exporter `reports` d'abord si son historique compte).
2. Ajouter `npm run lint` à la CI (§5.2).
3. Capturer l'infrastructure cron hors dépôt dans une migration (§5.1).

### Prochaine itération

4. `supabase gen types typescript` → supprime les 42 `any` (§5.7).
5. Déplacer l'outillage de build en `devDependencies` (§5.3).
6. Énumérer les colonnes des `select('*')` + borner les requêtes de tableau de bord (§5.4, §5.5).
7. Trancher sur `src/components/ui/` : adopter ou supprimer (§5.6).

### Quand une fenêtre le permet

8. Squash de la baseline de migrations (§3.4) — supprime le bruit création/destruction et les deux helpers `updated_at` en double.

### Reliquats des suppressions de modules

9. `/legal/cgv` décrit toujours la vente de formations, `/legal/guide-relecture` cite `/formations/[slug]/inscription`. Aucun texte juridique n'a été réécrit : cela relève de votre décision.
10. Retirer les variables SMTP de Vercel (`SMTP_*`, `ADMIN_NOTIFICATION_EMAILS`) — plus lues par le code depuis la PR #14. **Garder `CRON_SECRET`**, utilisé par `/api/cron/aggregate-downloads`.
