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
| Indicateur | Avant | Après |
|---|---|---|
| Lignes dans `src/` | 38 024 | **35 330** |
| Fichiers `src/` | 229 | **204** |
| Pages Astro | 71 | 71 |
| Routes API | 36 | **26** |
| Migrations SQL | 31 | **18** |
| Warnings lint | 45 | **38** |
| Erreurs build / check / lint | 0 / 0 / 0 | **0 / 0 / 0** |

Autres repères : 5 fichiers de tests e2e, `dist/` à 12 Mo, 24 hints `astro check`, 3 TODO/FIXME.

---

## 2. Ce qui a été corrigé

### Passe 1 — nettoyage structurel

| Action | Détail |
|---|---|
| 14 migrations supprimées | Objets créés puis détruits par les migrations de suppression — voir §3 |
| Migration de nettoyage | `20260802140000_cleanup_orphan_objects.sql` — voir §4 |
| 3 dépendances mortes retirées | `astro-icon`, `@iconify-json/mdi`, `js-yaml` |
| Intégration `icon()` retirée | Chargée dans `astro.config.mjs` sans qu'aucun `<Icon>` n'existe dans le code |
| 7 composants orphelins supprimés | `AideBenevoleCTA`, `AnimatedFeaturesGrid`, `Citation`, `Confiance`, `Services`, `SEO/GEO`, `SEO/HowTo` |
| 2 fichiers dupliqués supprimés | `public/sw-register.js` et `src/scripts/sw-register.js`, octet pour octet identiques et **tous deux morts** : l'enregistrement du service worker est inliné dans `Layout.astro:120` |

### Passe 2 — application des recommandations

| Recommandation | État |
|---|---|
| §5.2 Étape ESLint conditionnelle en CI | **Fait** — `run: npm run lint` inconditionnel |
| §5.3 Outillage de build en `dependencies` | **Fait** — `@astrojs/check`, `@astrojs/ts-plugin`, `typescript` passés en `devDependencies`, build vérifié |
| §5.4 `select('*')` | **Fait sur les endpoints publics** ; raisonnement révisé pour les autres, voir §5.4 |
| §5.5 Requêtes sans borne | **Fait sur les listes à croissance non bornée**, avec signalement de troncature |
| §5.6 Kit `src/components/ui/` | **Fait** — `Avatar`, `Button`, `Input`, `Modal`, `Select` supprimés ; `ConfirmDialog` et `Toast` conservés |
| §5.7 Warnings ESLint | **Non fait** — tentative annulée, voir §5.7 |
| §5.1 Infra cron hors dépôt | **Bloqué** — nécessite un accès à la base, voir §5.1 |
| §3.4 Squash de la baseline | **Non fait** — opération dédiée, voir §3.4 |

### Passe 3 — suppression des modules orphelins

| Module | Contenu supprimé |
|---|---|
| `adherents` / RBAC | 6 routes API, `lib/adherentsApi.ts`, migration `20260101080000` (432 lignes), 8 tables, 1 fonction, 1 type enum |
| `partners` | 2 routes API, `types/partners.ts`, 1 table |

Migration `20260802160000_drop_adherents_rbac_and_partners.sql` — **non appliquée**. Détail et mises en garde en §5.8.

### Régression interceptée

`src/pages/dashboard/admin/users.astro` sélectionnait et affichait `reports_count` — **la colonne que la migration `20260802140000` supprime**. Appliquer cette migration aurait cassé la page d'administration des utilisateurs.

La colonne, la propriété de type, la cellule et l'en-tête « Signalements » ont été retirés. C'est le genre de couplage qu'un audit table-par-table ne voit pas : `reports` n'avait aucune référence, mais son compteur dénormalisé sur `profiles`, si.

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

### 5.2 Haute — étape ESLint de la CI conditionnelle *(corrigé dans cette passe)*

L'étape lint existait bien dans `.github/workflows/ci.yml`, mais derrière une garde :

```yaml
if [ -f eslint.config.js ] || [ -f eslint.config.mjs ]; then
  npm run lint
else
  echo "::warning::Pas de eslint.config.js : lint skippe (TODO P2 #17)"
fi
```

`eslint.config.js` existe, donc le lint tournait effectivement. Le défaut était la garde elle-même : héritée de l'époque où la flat config n'existait pas encore (TODO P2 #17, résolu depuis), elle transformait toute disparition ou renommage du fichier de configuration en **CI verte avec un simple `::warning::`**.

C'est un angle mort qui compte, parce que la règle maison `no-unguarded-auth-result` (`eslint-rules/require-auth-narrow.cjs`) est un garde-fou d'authentification : elle rattrape un `await requireAdmin()` sans `instanceof Response`, cas que TypeScript laisse passer dans un frontmatter `.astro`. ESLint est le seul filet sur ce contrat — il doit échouer bruyamment, pas s'auto-désactiver.

**Corrigé :** l'étape est désormais inconditionnelle (`run: npm run lint`).

**Reste à faire :** `eslint .` sort en code 0 tant qu'il n'y a que des warnings. Les 42 warnings actuels (§5.7) peuvent donc croître sans que la CI bronche. Une fois cette dette résorbée, passer à `eslint . --max-warnings 0` pour verrouiller le acquis.

### 5.3 Moyenne — outillage de build en dépendances de production *(appliqué)*

`@astrojs/check`, `@astrojs/ts-plugin` et `typescript` étaient dans `dependencies`. Sur Vercel, `npm ci` les installait en production : install plus lent et surface plus large, sans aucun bénéfice à l'exécution.

Déplacés en `devDependencies` (22 dépendances de production, 14 de développement). `npm run build` et `npm run check` vérifiés après le déplacement — Vercel installe les `devDependencies` au build, `astro check` reste donc disponible en CI comme en local.

### 5.4 Moyenne — `select('*')` *(appliqué de façon ciblée)*

La recommandation initiale — « énumérer partout » — était trop large. La vérification colonne par colonne des pages concernées la contredit :

| Emplacement | Colonnes réellement utilisées | Décision |
|---|---|---|
| `api/partenaires/index.ts` | endpoint **public** | **Énuméré** |
| `api/partenaires/[id].ts` | endpoint **public** | **Énuméré** |
| `admin/contacts.astro` | 8 sur 8 | `*` conservé |
| `admin/trombinoscope.astro` | ~toutes | `*` conservé |
| `admin/logiciels.astro` | 9 sur 11 | `*` conservé |
| `admin/resources.astro` | 9 sur 13 | `*` conservé — voir ci-dessous |
| `association/index.astro` | ligne propre, filtrée par `association_id` | `*` conservé |

**Ce qui compte vraiment, c'est l'exposition publique.** Sur `/api/partenaires`, `select('*')` signifie que toute colonne ajoutée plus tard à `partners` — note interne, contact, montant de convention — serait publiée sans qu'aucune revue ne le signale. Les colonnes y sont désormais énumérées.

Pour les tableaux de bord admin, `select('*')` est légitime : ce sont des écrans CRUD qui éditent la ligne entière, derrière authentification. `admin/resources.astro` était le cas limite — il n'utilise pas `file_path` — mais le narrower aurait rendu mensonger le cast `as Resource[]`, pour le seul gain de ne pas envoyer un chemin de stockage dans du HTML déjà protégé par authentification. Non fait, à traiter avec le typage généré (§5.7).

### 5.5 Moyenne — requêtes sans borne *(appliqué)*

Distinction faite entre les tables **à croissance non bornée** (alimentées par les utilisateurs) et les **catalogues curés** (quelques dizaines de lignes, gérés à la main).

Bornées, car elles grossissent sans plafond :

| Page | Table | Traitement |
|---|---|---|
| `admin/contacts.astro` | `contact_submissions` | `limit(201)` + bandeau de troncature |
| `admin/demandes.astro` | `requests` | `limit(201)` + bandeau de troncature |
| `user/demandes.astro` | `requests` (par membre) | `limit(200)` |

Les catalogues (`software`, `resources`, `benevoles`, `association_projects`) sont laissés sans borne : y ajouter une limite créerait un risque de **troncature silencieuse** — un catalogue de 201 entrées en perdrait une sans que personne ne le voie — pour un bénéfice nul à leur volume réel.

Sur les deux listes admin, la requête demande volontairement `LIST_CAP + 1` lignes : c'est ce qui permet de savoir que la liste est tronquée et de le dire, au lieu de masquer des messages. Un `.limit()` nu aurait remplacé un problème de performance par une perte de données invisible.

**Reste à faire :** la vraie correction est la pagination. Le gabarit existe déjà dans `logs.astro`, `users.astro` et `user/activity.astro` (`.range(from, from + perPage - 1)` avec `count: 'exact'`) — il suffit de l'appliquer à ces deux pages.

### 5.6 Basse — kit UI à moitié adopté *(appliqué)*

`src/components/ui/` contenait 8 composants. `ConfirmDialog` et `Toast` sont utilisés ; `Avatar`, `Button`, `Input`, `Modal`, `Select` ne l'étaient **nulle part**.

Les 5 inutilisés ont été supprimés. Les pages continuent d'utiliser leur CSS local : **aucun changement visuel**.

Si le besoin d'un kit partagé revient, le reconstruire depuis l'historique git est trivial — et il faudra alors l'adopter réellement, pas seulement le déclarer.

### 5.7 Basse — 42 warnings ESLint

| Règle | Occurrences |
|---|---|
| `@typescript-eslint/no-explicit-any` | 15 |
| `@typescript-eslint/no-unused-vars` | 12 |
| `no-useless-escape` | 10 |
| `no-useless-assignment` | 5 |

**Aucun n'a été corrigé, et c'est un choix documenté.** J'ai tenté la correction ; elle a produit **282 erreurs de type** et a été annulée. Détail par règle :

**`no-useless-escape` (10)** — j'ai remplacé les `\'` par `'` dans `auteur/[slug].astro` et `formValidation.ts`. Erreur : ESLint ne signalait que les `\'` situés dans des chaînes à **guillemets doubles** ou des littéraux gabarits, où l'échappement est superflu. Les autres sont dans des chaînes à **guillemets simples**, où il est *obligatoire*. Un remplacement global casse le fichier. `eslint --fix` ne corrige pas cette règle automatiquement. Correction possible, mais ligne par ligne et sans gain fonctionnel.

**`no-useless-assignment` (5)** — `let body: Record<string, unknown> = {}` dans `legal/accept.ts:42`, `newsletter.ts:22`, et deux cas voisins. Ce sont des **initialiseurs défensifs** : la valeur est bien réassignée sur tous les chemins actuels, ce que la règle détecte, mais la retirer rendrait la variable non initialisée si un futur chemin de sortie anticipé était ajouté. La règle a tort ici sur le fond.

**`no-unused-vars` (12)** — 7 sont des constantes de `scripts/generate-pdfs.js` qui forment un **miroir complet de la palette de `theme.css`**. En supprimer 7 sur 19 laisserait une palette partielle et trompeuse : c'est le même raisonnement que pour le kit UI (§5.6), sauf qu'ici le bloc vaut par sa complétude. Les 5 autres sont des variables abandonnées isolées (`redirectTo` dans `connexion.astro:11`, `readingTimeMin` dans `blog/[...slug].astro:51`, `windowMs` dans `rateLimit.ts:61`), corrigeables sans risque au prochain passage sur ces fichiers.

**`@typescript-eslint/no-explicit-any` (15)** — concentrés dans les `.map((d: any) => ...)` sur les retours Supabase. Le correctif propre est `supabase gen types typescript`, qui génère les types depuis le schéma réel : il supprime la classe entière de warnings, rattrape les fautes de frappe sur les noms de colonnes, et débloque au passage le cas `admin/resources.astro` de §5.4. **Nécessite un accès à la base** — à lancer de votre côté :

```bash
supabase gen types typescript --project-id <ref> > src/types/database.ts
```

Aucun de ces 42 warnings ne provient des suppressions de modules : tous préexistaient. Aucun n'a d'effet à l'exécution.

### 5.8 Modules entièrement orphelins *(supprimés)*

Deux modules complets — code **et** schéma — n'avaient aucun consommateur.

#### `adherents` / RBAC

Le plus gros des deux. Il comprenait 6 routes API (`/api/adherents/*`, `/api/groupes/*`), `src/lib/adherentsApi.ts`, la migration `20260101080000_add_adherents_rbac_groups.sql` (432 lignes) et **8 tables** : `adherents`, `adherent_groupes`, `adherent_historiques`, `adherent_tags`, `groupes`, `tags`, `roles`, `utilisateur_roles`.

**Aucune page, aucun composant n'appelait ces routes**, et il n'existait pas d'écran d'administration pour alimenter le fichier. C'était une API sans client, avec import CSV, export, recherche plein texte et historique d'audit — l'ensemble jamais atteignable depuis le site.

> **Ne pas confondre avec le système de rôles applicatif**, qui reste intact. L'autorisation passe par `profiles.role` et `public.get_my_role()` (lue depuis le JWT). Les tables `roles` / `utilisateur_roles` supprimées ici appartenaient au RBAC du module adhérents, jamais branché sur l'authentification.

#### `partners`

Table `partners`, endpoints `/api/partenaires` (`index.ts` et `[id].ts`), type `src/types/partners.ts`. Aucun consommateur dans le dépôt, aucun écran d'administration.

J'avais d'abord recommandé de le conserver le temps de vérifier les logs Vercel — `/api/partenaires` étant un endpoint **public**, un consommateur externe restait plausible et invisible depuis le dépôt. Décision prise de le supprimer.

> ⚠️ **Si un client externe appelait `/api/partenaires`, il recevra un 404 après déploiement.** C'est le seul risque de cette suppression, et il n'est pas vérifiable depuis le code. À contrôler dans les logs Vercel après la mise en production.

### 5.9 Endpoints sans consommateur — délibérément conservés

Quatre routes n'ont, elles non plus, aucun appelant dans le dépôt. Elles ne sont pas mortes pour autant, et les supprimer serait une erreur :

| Route | Pourquoi elle reste |
|---|---|
| `/api/cron/aggregate-downloads` | Appelée par **pg_cron** via `net.http_post()`. Son appelant est dans la base, pas dans le code. |
| `/api/indexnow` | Ping SEO des moteurs de recherche, déclenché au déploiement. La supprimer arrêterait silencieusement l'indexation accélérée. |
| `/api/me/export-data` | **RGPD Art. 15** — droit d'accès. |
| `/api/me/delete-data` | **RGPD Art. 17** — droit à l'effacement. |

Les deux endpoints RGPD révèlent en creux un **manque, pas un surplus** : aucun écran ne permet à un membre de les déclencher. `dashboard/user/settings.astro` ne contient ni bouton d'export ni bouton de suppression. La fonctionnalité existe côté serveur mais reste hors de portée de l'utilisateur — à combler.

Même remarque pour `/api/legal/accept` et la table `legal_acceptance` : ses seuls appelants étaient les formulaires d'inscription aux formations, supprimés. L'endpoint reste en place — c'est de la preuve juridique, pas du code mort à balayer — mais il est aujourd'hui sans usage.

### 5.10 Basse — pages volumineuses

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

## 7. Plan d'action — ce qui reste

Tout ce qui pouvait être fait depuis le dépôt l'a été (§2). Ce qui suit demande soit un accès à la base, soit une décision métier.

### Nécessite un accès à la base — vous seul pouvez le faire

1. **Appliquer les deux migrations, dans l'ordre**, après avoir exporté ce qui a de la valeur (`reports`, `adherents` et son historique, `partners`) :
   - `20260802140000_cleanup_orphan_objects.sql`
   - `20260802160000_drop_adherents_rbac_and_partners.sql`

   ⚠️ La régression `reports_count` sur `admin/users.astro` est corrigée dans cette branche : appliquer la première migration **sans** ce correctif casserait la page d'administration des utilisateurs.
2. **Capturer l'infrastructure cron hors dépôt** (§5.1) : `app_runtime_config`, `pg_cron_audit`, `aggregate_downloads()` et son job.
3. **Générer les types Supabase** (§5.7) — supprime les 15 `any` et débloque `admin/resources.astro` :
   ```bash
   supabase gen types typescript --project-id <ref> > src/types/database.ts
   ```
4. **Vérifier les logs Vercel** après déploiement : si un client externe appelait `/api/partenaires`, il reçoit désormais un 404 (§5.8).

### Décision métier

5. **Exposer les endpoints RGPD** (§5.9) : `/api/me/export-data` et `/api/me/delete-data` fonctionnent mais aucun écran ne permet de les déclencher. C'est un manque, pas un surplus.
6. **Textes légaux** : `/legal/cgv` décrit toujours la vente de formations, `/legal/guide-relecture` cite `/formations/[slug]/inscription`. Aucun texte juridique n'a été réécrit.
7. **Variables SMTP de Vercel** : retirer `SMTP_*` et `ADMIN_NOTIFICATION_EMAILS`, plus lues par le code depuis la PR #14. **Garder `CRON_SECRET`**, utilisé par `/api/cron/aggregate-downloads`.

### Quand une fenêtre le permet

7. **Squash de la baseline de migrations** (§3.4) — supprime le bruit création/destruction et les deux helpers `updated_at` en double.
8. **Pagination** sur `admin/contacts` et `admin/demandes` (§5.5), en reprenant le gabarit de `logs.astro`.
9. **`--max-warnings 0`** une fois les 42 warnings résorbés (§5.2, §5.7), pour verrouiller l'acquis.
