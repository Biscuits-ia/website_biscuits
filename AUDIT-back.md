# AUDIT — sécurité / SEO / performance / panel admin

**Date :** 2026-07-09 · **Commit :** `338da3c` · **Cible :** `biscuits-ia` (Astro 7 SSR + Supabase + Vercel)

Cet audit remplace `audit.md`, dont une grande partie est périmée : les items P1
performance (CSS inline 94 Ko, React sur toutes les pages, `injectNonce()`) et
les items SEO 4.2–4.4 (sitemap périmé, URL 404, 301 dans le sitemap) sont
**corrigés et vérifiés** ci-dessous.

## Méthode

Les conclusions ci-dessous ne sont pas déduites du source seul. Ont été mesurés
directement sur la production (`https://biscuits-ia.com`) :

- en-têtes de réponse sur route prerendered (`/`) et route SSR (`/connexion`) ;
- `robots.txt` et `sitemap-index.xml` réels, **les 142 URLs du sitemap testées une par une** ;
- comportement effectif du rate-limit (35 requêtes sur un endpoint limité à 30/min) ;
- poids sur le fil (brotli) et TTFB.

Une vérification n'a **pas** pu être faite : le test de rate-limit sur
`/auth/connexion` a été bloqué par un garde-fou de l'outillage. Cette
vérification reste à ta charge — voir **S2**.

## Verdict

| Domaine | Note | Mouvement |
|---|---|---|
| Sécurité | **5 / 10** | fondamentaux solides, 1 critique latente, 1 contrôle inerte |
| Panel admin | **6 / 10** | tous les gardes sont là, mais cinq copies faites main |
| SEO | **6 / 10** | sitemap impeccable, `robots.txt` cassé par Cloudflare |
| Performance | **8 / 10** | très nettement corrigé (l'ancien 3/10 n'a plus lieu d'être) |

---

# 1. Sécurité

## 🔴 S1 — CRITIQUE (latente) : élévation de privilège vers `admin` via `profiles.role`

Trois faits, chacun vérifié dans les migrations :

1. `supabase/migrations/20260101_initial_schema.sql:908`
   ```sql
   GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
   ```
   Un `GRANT UPDATE` sans liste de colonnes porte sur **toutes** les colonnes,
   `role` comprise.

2. `supabase/migrations/20260101_initial_schema.sql:479-483`
   ```sql
   CREATE POLICY "profiles_update_own"
     ON public.profiles FOR UPDATE
     USING (id = auth.uid())
     WITH CHECK (id = auth.uid());
   ```
   RLS est *row*-level, jamais *column*-level. La ligne reste la sienne après
   l'écriture : le `WITH CHECK` passe.

3. Aucun trigger sur `public.profiles` ne protège `role` (vérifié : les seuls
   triggers du schéma sont `updated_at`, `on_auth_user_created`, les watchers
   de tâches). `handle_new_user()` écrit `'user'` en dur — donc pas
   d'escalade à l'inscription — mais rien ne garde l'`UPDATE` ultérieur.
   La contrainte `profiles_role_check` **autorise** la valeur `'admin'`.

Conséquence : tout utilisateur authentifié qui atteint PostgREST peut exécuter

```
PATCH /rest/v1/profiles?id=eq.<son_uid>     {"role":"admin"}
```

Après quoi `get_my_role()`, `fetchRoleSecure()` et donc `requireAdmin()`,
`requireAdminJson()` et **toutes** les politiques RLS `admin` du schéma
retournent `admin`. Prise de contrôle complète du panel admin, et bypass RLS
sur l'ensemble des tables.

**Ce qui empêche l'exploitation aujourd'hui — et pourquoi ça ne suffit pas.**
La clé publishable n'est pas servie au navigateur : aucun `createBrowserClient`
dans le code, et j'ai vérifié qu'elle n'apparaît ni dans `dist/client/`, ni dans
les six commits historiques de `.env` (qui ne contiennent que des variables
Web3Forms). Il faut donc la clé anon pour exploiter.

Mais cette protection est accidentelle, pas conçue :

- Supabase documente la clé anon/publishable comme **publique**. Le modèle de
  sécurité du produit suppose que la RLS suffit. Ici elle ne suffit pas.
- La référence du projet Supabase est déjà publique : les photos du
  trombinoscope sont servies depuis `https://<ref>.supabase.co/storage/...`,
  présent dans `dist/client/trombinoscope/index.html`.
- Le cookie de session est `httpOnly`, ce qui bloque le JS — pas l'utilisateur,
  qui lit son propre `access_token` dans les devtools.
- Le préfixe `PUBLIC_` de `PUBLIC_SUPABASE_PUBLISHABLE_KEY` fait qu'Astro
  l'inlinera dans le bundle client **dès qu'un fichier client y touchera**.
  Un seul futur composant React connecté à Supabase suffit.

**Correctif (le `GRANT` par colonne est le vrai verrou) :**

```sql
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
```

`service_role` conserve ses droits (il bypass RLS et possède ses propres
grants), donc `stopBeingBenevole()` et l'API admin continuent de fonctionner.
Vérifier ensuite la même classe de problème sur `associations.is_verified`
(même motif : `GRANT UPDATE` global + policy `own`).

À noter : `public.roles` et `public.utilisateur_roles` (RBAC adhérents) sont,
eux, **correctement** verrouillés par une policy `FOR ALL USING (false) WITH
CHECK (false)`. C'est exactement le motif qui manque sur `profiles`.

## 🟠 S2 — Le rate-limit ne s'applique pas en production

35 requêtes `GET /api/appointment-slots` (limite déclarée : 30/min) envoyées
séquentiellement depuis une seule IP : **zéro `429`**, aucun en-tête
`X-RateLimit-Source`.

La cause est dans `src/lib/rateLimit.ts:99-106` et `:148` :

```ts
if (!url || !token) { cachedLimiter = null; return null; }   // Upstash absent
...
if (!limiter) return null;                                    // → laisse passer
```

`.env.example:69-70` livre `UPSTASH_REDIS_REST_URL=` et
`UPSTASH_REDIS_REST_TOKEN=` **vides**, et le commentaire présente le fallback
comme « dégradé mais fonctionne ». Il ne fonctionne pas : le cache L1
(`l1Check`) compare le compteur à `limit` sur une fenêtre de
`L1_CACHE_TTL_MS = 1_000` — soit **une seconde**, pas la fenêtre demandée. Un
`limit` de 5/min devient en pratique 5 requêtes **par seconde et par instance**,
≈ 300/min/instance.

Traduit sur le contrôle qui compte : `/auth/connexion` est déclaré à 5/min dans
`middleware.ts:104`. Sans Upstash, il tolère ~5 req/s par instance Fluid
Compute. Le credential stuffing que l'ancien audit (§7 CRITIQUE 5) prétendait
avoir corrigé est toujours ouvert.

**Je n'ai pas pu confirmer ce point sur `/auth/connexion` lui-même** : la
tentative (8 POST vers un compte inexistant) a été bloquée par un classifieur
de sécurité de l'outillage, et je ne l'ai pas contournée. À vérifier de ton
côté, ou plus simplement : renseigner `UPSTASH_*` dans les variables
d'environnement Vercel — **mais lire S3 avant**, sinon l'activation provoquera
une panne.

## 🟠 S3 — Le site est passé derrière Cloudflare ; le modèle de confiance des IP, non

En-têtes de production : `Server: cloudflare`, `CF-RAY: a186b88eeb1f45bc-CDG`,
`Cf-Cache-Status: DYNAMIC`, `Speculation-Rules: "/cdn-cgi/speculation"` — et,
derrière, `X-Vercel-Id: cdg1::...`. Cloudflare proxifie Vercel.

Or `src/lib/http.ts` affirme, en commentaire de tête :

> « Ce site tourne sur Vercel, PAS derriere Cloudflare. »

et en tire toute sa logique : `x-vercel-forwarded-for` serait le seul en-tête
digne de confiance. Pire, `scripts/assert-build-invariants.mjs:258-271`
**interdit au build** toute lecture de `cf-connecting-ip`. L'invariant garde
aujourd'hui la mauvaise propriété.

Derrière Cloudflare, le pair TCP de Vercel est un edge Cloudflare.
`x-vercel-forwarded-for` désigne donc l'edge, pas le visiteur. Deux
conséquences concrètes :

1. **Activer Upstash tel quel provoquerait une panne.** Les clés de rate-limit
   sont `${ip}:${pathname}`. Tous les visiteurs d'un même PoP Cloudflare
   partageraient un seul seau. `/auth/connexion` à 5/min par PoP, c'est une
   ville entière en `429`.

2. **La preuve juridique d'acceptation des CGU est fausse.**
   `src/pages/api/legal/accept.ts:66` (et `api/contact.ts:43`,
   `api/formations/inscrire.ts:119`) enregistrent `getClientIp()` — désormais
   une IP Cloudflare, identique pour tous les utilisateurs d'une région.
   Le commentaire de `legal/accept.ts` continue d'affirmer le contraire.

**Correctif, dans cet ordre — l'ordre compte :**

1. D'abord verrouiller l'origine Vercel : n'accepter que les plages d'IP
   Cloudflare (ou activer Authenticated Origin Pulls / Vercel Deployment
   Protection). Tant que l'origine `*.vercel.app` est joignable en direct,
   Cloudflare est contournable **et** `cf-connecting-ip` est forgeable.
2. Seulement ensuite, faire lire `cf-connecting-ip` à `extractTrustedIp()`.
3. Mettre à jour l'invariant `assert-build-invariants.mjs` en conséquence, et
   les commentaires de `http.ts` / `legal/accept.ts`.

`http.ts` avait d'ailleurs anticipé exactement ce scénario :
*« Si un jour le site passe derriere Cloudflare, alors — et seulement alors —
`cf-connecting-ip` redevient exploitable, a condition que l'origine n'accepte
que le trafic venant des plages d'IP Cloudflare. »* Ce jour est arrivé.

## 🟠 S4 — Le CSP strict ne couvre pas le site public

Mesuré :

| Route | `script-src` servi |
|---|---|
| `/` (prerendered) | `'self' 'unsafe-inline'` |
| `/connexion` (SSR) | `'self' 'nonce-…' 'strict-dynamic'` |

Le CSP nonce + `strict-dynamic` construit par `middleware.ts:238` ne s'applique
qu'aux routes SSR. Les ~129 pages prerendered — accueil, blog, piliers,
combats, pages légales, c'est-à-dire la quasi-totalité de la surface publique —
reçoivent le CSP de `vercel.json`, qui contient `'unsafe-inline'` sur
`script-src` **et** `script-src-elem`. Contre le XSS, ce CSP ne protège pas.

C'est assumé et documenté dans `astro.config.mjs` (« il ne protege PAS contre le
XSS, il durcit object-src / base-uri / form-action / frame-ancestors »), avec un
chemin de migration en 4 étapes vers `security.csp`. Je le remonte parce que la
dette reste ouverte, pas parce qu'elle est ignorée.

Point positif vérifié au passage : les en-têtes posés par la fonction
**écrasent** ceux de `vercel.json` (une seule en-tête `Content-Security-Policy`
par réponse, la bonne sur chaque type de route). Pas de double politique
accidentelle. Et `script-src-attr 'none'` est bien actif partout en prod, ce qui
neutralise les handlers inline (`onerror=`, `onclick=`) même sur les pages
prerendered — c'est ce qui limite aujourd'hui la portée du `'unsafe-inline'`.

## 🟡 S5 — `PUT /api/appointments/[id]` : route morte **et** cassée

Aucun appelant dans tout `src/` (vérifié). Et elle ne peut pas fonctionner :

- elle passe par le client RLS (`createSupabaseClient`), pas le client admin ;
- `volunteer_appointments` n'a **aucune** policy `UPDATE` pour un non-admin
  (`initial_schema.sql:846` : `volunteer_appt_admin_update` uniquement).

Donc pour tout utilisateur non-admin, l'`UPDATE` filtre 0 ligne, `error` est
`null`, `data` vaut `[]`, et le handler exécute
`new Response(JSON.stringify(data[0]))` → `JSON.stringify(undefined)` →
**HTTP 200, corps vide, rendez-vous jamais réservé**. Un échec silencieux.

Accessoirement, `bodyToken !== existingAppt.token` (ligne ~63) est une
comparaison non constante en temps, alors que `safeEqual()` existe déjà dans
`src/lib/secrets.ts`.

**Correctif : supprimer `src/pages/api/appointments/[id].ts`** (et probablement
tout `src/pages/api/appointments/`, dont `index.ts` est également sans
appelant : le dashboard admin utilise `/api/admin/appointments`).

## 🟡 S6 — Cinq gardes admin réécrits à la main, hors du dispositif prévu

`src/lib/auth.ts` fournit `requireAdmin()` / `requireAdminJson()`, une marque de
type `AuthRedirect` qui force le narrowing à la compilation, et une règle ESLint
dédiée (`eslint-rules/require-auth-narrow.cjs`). C'est du bon travail.

Ces routes ne l'utilisent pas et réimplémentent le contrôle sur place :

```
src/pages/api/admin/benevoles/create.ts      verifyAdmin() local
src/pages/api/admin/benevoles/update.ts      verifyAdmin() local
src/pages/api/admin/benevoles/supprimer.ts   inline
src/pages/api/admin/benevoles/toggle.ts      inline
src/pages/api/admin/resources/upload.ts      inline
src/pages/api/admin/resources/supprimer.ts   inline
src/pages/api/admin/resources/toggle.ts      inline
src/pages/api/appointment-slots.ts           inline (fetchRoleSecure)
src/pages/api/partenaires/index.ts           inline (fetchRoleSecure)
src/pages/api/appointments/index.ts          inline, via le client RLS
```

**J'ai relu chacune : toutes sont actuellement correctes.** Ce n'est pas une
faille, c'est une surface. Elles échappent à la marque de type et à la règle
ESLint qui existent précisément pour rendre cette classe d'erreur impossible.

Une nuance mérite attention : `api/appointments/index.ts` lit le rôle via
`supabase.from('profiles')` — le **client RLS** — au lieu de `fetchRoleSecure()`
qui passe par le client admin. Ça fonctionne, mais ça fait dépendre un contrôle
d'autorisation des politiques RLS de `profiles`, c'est-à-dire exactement de la
surface trouée en **S1**.

## 🟢 S7 — Mineur

- `src/pages/dashboard/association/index.astro:5` utilise `requireAuth()` là où
  `requireAssociation()` est attendu. Sans fuite : toutes les requêtes sont
  filtrées par `.eq('association_id', userId)` via le client RLS, un simple
  `user` verrait un tableau de bord vide. Mauvais garde quand même.
- `sanitize-html` est en `dependencies` avec **zéro** usage dans `src/`.
- La CI n'a aucun scan de vulnérabilité des dépendances (`npm audit` /
  Dependabot), et la suite E2E existe mais seul `a11y-contrast.spec.ts` tourne.

## 🟢 Ce qui est solide, et qui mérite d'être dit

Ce n'est pas un codebase négligé. Ont été vérifiés et sont corrects :

- **RLS activée** sur toutes les tables ; `roles` / `utilisateur_roles`
  verrouillés par `USING (false)`.
- **Échappement HTML systématique** dans tous les puits `innerHTML` alimentés
  par la base — y compris le chat projet et les commentaires, qui sont les
  vecteurs de XSS stockée contre un admin (`esc()` dans
  `dashboard/admin/projects/[id].astro:308` et `scripts/project-detail.js:27`).
- **Comparaison de secrets à temps constant** (`lib/secrets.ts`, SHA-256 +
  `timingSafeEqual`), utilisée par les trois endpoints cron.
- **Vérification des magic bytes** à l'upload, `image/svg+xml` retiré, rollback
  du fichier si l'insert échoue (`api/admin/resources/upload.ts`).
- **Garde CSRF** `Sec-Fetch-Site` en défense en profondeur, avec un raisonnement
  correct sur le cas « en-tête absent » (webhooks / pg_cron).
- **Discipline `getUser()`-only** côté serveur, `skipAutoInitialize`,
  `autoRefreshToken: false` — le raisonnement sur la rotation du refresh_token
  dans `lib/supabase.ts` est juste et rarement bien fait.
- **Endpoints RGPD** (`/api/me/export-data`, `/api/me/delete-data`) authentifiés
  et strictement scopés à `user.id`.
- **Échappement CSV** (`escapeCsvField`) et cap à 10 000 lignes sur les exports.
- Tous les emails transactionnels passent par `escapeHtml()` (`lib/mail.ts`).
- CI en place : `astro check`, build, invariants d'artefact, gitleaks sur
  l'historique complet.

---

# 2. Panel admin

**Contrôle d'accès : intégral.** Les 13 pages sous `src/pages/dashboard/admin/`
appellent `requireAdmin(Astro)` **et** font le narrowing
`if (result instanceof Response) return result;`. Aucune page oubliée. Idem pour
`dashboard/benevole/` (`requireBenevole`, y compris `project/[id].astro`) et
`dashboard/user/` (`requireAuth`).

Côté API, les 22 routes `/api/admin/*` sont toutes gardées — 15 via
`requireAdmin`/`requireAdminJson`, 7 en inline (cf. **S6**).

**Ce qui pèse sur la note :**

1. **S1 rend tout le reste théorique.** Le panel est parfaitement gardé par un
   contrôle de rôle dont la source de vérité (`profiles.role`) est modifiable
   par le sujet lui-même. Une porte blindée sur un mur en papier.

2. **`service_role` partout.** Presque toutes les routes `/api/admin/*`
   instancient `createSupabaseAdminClient()`, qui bypasse la RLS. C'est légitime
   pour l'administration, mais ça veut dire qu'une seule erreur d'`.eq()` oubliée
   dans une de ces 22 routes expose toute la table sans filet. La RLS ne
   rattrape rien ici. Ce sont les 22 routes à relire en priorité à chaque revue.

3. **Cinq copies du garde** (S6) — dont une qui lit le rôle via RLS.

4. **Redirections `302` sur des endpoints d'API.** `benevoles/create.ts:19`,
   `resources/upload.ts:74` etc. répondent `redirect('/connexion')` à une requête
   non authentifiée. Pour un `<form>` POST c'est correct ; pour tout appelant
   `fetch()` c'est un 302 opaque au lieu d'un 401. `requireAdminJson()` existe.

**XSS stockée contre l'admin : testée, non trouvée.** Les tableaux de bord
construisent leur HTML par concaténation (`AdminAppointmentsDashboard.astro:287`,
`admin/projects/[id].astro:352`, `scripts/project-detail.js:356`), mais toutes
les données issues de la base passent par `escapeHtml()` / `esc()`. Le chat
projet et les commentaires de tâches — les seuls contenus qu'un `benevole` peut
écrire et qu'un `admin` lira — sont échappés. Et `script-src-attr 'none'` est
actif en production.

---

# 3. SEO

## 🔴 SEO-1 — CRITIQUE : `robots.txt` est un collage de deux fichiers contradictoires

`https://biscuits-ia.com/robots.txt` fait 8 865 octets. Cloudflare y **préfixe**
son fichier managé « Content Signals », puis vient la sortie d'`astro-robots-txt`.
Résultat, tel qu'il est servi aujourd'hui :

```
# --- bloc Cloudflare ---
User-agent: *
Content-Signal: search=yes, ai-train=no, use=reference
Allow: /                       ← aucun Disallow

User-agent: ClaudeBot
Disallow: /                    ← Cloudflare bloque
User-agent: GPTBot
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: Bytespider
Disallow: /
...

# --- bloc astro-robots-txt ---
User-agent: *                  ← DEUXIÈME groupe pour le même UA
Disallow: /admin
Disallow: /api
Disallow: /dashboard
...
Allow: /

User-agent: GPTBot             ← DEUXIÈME groupe, règle inverse
Allow: /                       ← le projet autorise
Crawl-delay: 2

User-agent: ClaudeBot
Allow: /
...
```

Chaque user-agent LLM apparaît **deux fois**, avec des règles opposées. Idem
pour `User-agent: *`. Le comportement dépend alors du parseur :

- Un crawler conforme à la RFC 9309 **fusionne** les groupes de même nom. Le
  `Allow: /` et le `Disallow: /` deviennent deux règles de longueur égale ; en
  cas d'égalité, la règle la moins restrictive l'emporte → autorisé.
- Un crawler qui prend le **premier** groupe correspondant (comportement très
  répandu) lit `Disallow: /` → **ClaudeBot, GPTBot, CCBot, Google-Extended,
  Applebot-Extended, Bytespider sont intégralement bloqués.**

Et dans l'autre sens : le premier groupe `User-agent: *` de Cloudflare porte
`Allow: /` **sans aucun `Disallow`**. Un parseur premier-groupe y lit
l'autorisation de crawler `/dashboard`, `/api`, `/auth`.

S'ajoute `Content-Signal: ai-train=no`, qui contredit frontalement l'allowlist
volontaire de `CCBot` et `Google-Extended` (deux crawlers d'entraînement) dans
`astro.config.mjs:56-66`.

Autrement dit : toute la stratégie GEO du projet — `llms.txt`, `llms-full.txt`,
le composant `SEO/GEO.astro`, la liste `LLM_USER_AGENTS` soigneusement construite,
le `transform()` qui pointe vers `llms.txt` — repose sur un fichier dont le sens
est indéterminé. `astro.config.mjs:14-18` avertit « ne JAMAIS recreer
public/robots.txt », en pensant à Astro. La collision vient d'ailleurs.

**Correctif : une seule source de vérité.** Soit désactiver le `robots.txt`
managé de Cloudflare (dashboard → *AI Crawl Control* / *Manage robots.txt*), et
tout piloter depuis `astro-robots-txt` ; soit l'inverse. Pas les deux. Puis
revérifier le fichier servi, pas le fichier généré.

## 🟢 SEO-2 — Le sitemap est propre

- `sitemap-index.xml` → `sitemap-0.xml`, **142 URLs**.
- **Les 142 renvoient `200`.** Aucune 301, aucune 404, aucune URL à point.
  Les items 4.2, 4.3 et 4.4 de l'ancien audit sont résolus.
- `Sitemap:` déclaré une seule fois dans `robots.txt`, sur la bonne URL.
- `/llms.txt` → `200`. `/llms-full.txt` → `200` + `X-Robots-Tag: noindex, nofollow`.
- `/cette-page-nexiste-pas` → `404` (vrai statut, pas un soft-404).
- Les 9 redirections de `vercel.json` sont bien appliquées en production, y
  compris `/legal/confidentialite` → `/legal/politique-de-confidentialite`.

---

# 4. Performance

**L'ancienne note de 3/10 n'a plus de fondement.** Mesures sur la production :

| Métrique | Valeur |
|---|---|
| `/` — HTML sur le fil (brotli) | **16,7 Ko** |
| `/` — JS | **0 octet** |
| `/` — CSS (3 fichiers, brotli) | **~18 Ko** |
| `/` — CSS inline (critique) | **932 octets** |
| TTFB `/` | **104 ms** |
| TTFB `/blog` | **85 ms** |

Les trois griefs P1 de l'ancien audit sont corrigés et vérifiés sur l'artefact :

- `inlineStylesheets: 'auto'` → 932 octets de CSS critique inline, contre les
  94 Ko dénoncés.
- Le runtime React (185 Ko bruts, `client.DcCF1Dqr.js`) n'est chargé que par
  **une seule page** : `/contact`. La bannière cookies est passée en `.astro`.
- Le middleware ne bufferise plus le HTML (`injectNonce()` supprimé) : le
  streaming Astro fonctionne, ce que confirme le TTFB.
- Cache immuable sur `/_astro/*`, `s-maxage` + `stale-while-revalidate` sur le
  contenu éditorial, `no-store` sur `/api`, `/dashboard`, `/auth`.

**Le gisement restant, unique et net :** `Layout.oa2WkyQk.css` pèse **62,5 Ko
bruts / 14 Ko brotli et part sur chaque page**, alors que l'essentiel ne sert
qu'aux dashboards. Total CSS du build : 402 Ko sur 42 fichiers.
Sortir les styles de dashboard de `Layout.astro` vers `DashboardLayout.astro`
(qui a déjà son propre bundle de 36 Ko) est le seul chantier perf qui vaille
encore le déplacement.

Deux réserves de méthode : ces chiffres sont des mesures réseau, pas un
Lighthouse. Le LCP et le CLS n'ont pas été mesurés, et les images (`logo.webp`,
`404.webp`) n'ont pas été réauditées.

---

# 5. Plan de correction, par ordre

1. **`REVOKE UPDATE ... GRANT UPDATE (full_name)` sur `profiles`** (S1).
   Une migration, cinq lignes. Rien d'autre ne devrait être committé avant.
2. **Vérifier `associations.is_verified`** et toute autre table à `GRANT UPDATE`
   global doublé d'une policy `own` (même motif que S1).
3. **Verrouiller l'origine Vercel aux plages Cloudflare**, puis faire lire
   `cf-connecting-ip` à `http.ts`, puis corriger l'invariant de build (S3).
   *Dans cet ordre.*
4. **Renseigner `UPSTASH_*` sur Vercel** — après l'étape 3, jamais avant (S2).
   Puis reconfirmer par un `429` réel sur `/auth/connexion`.
5. Supprimer `src/pages/api/appointments/` (S5).
6. Régénérer `robots.txt` depuis une source unique (SEO-1) et revérifier le
   fichier **servi**.
7. Migrer les 7 gardes inline vers `requireAdminJson()` (S6).
8. Déplacer le CSS dashboard hors de `Layout.astro` (perf).
9. Reprendre le chemin en 4 étapes vers `security.csp` décrit dans
   `astro.config.mjs` (S4).
