# Design — Application P1 audit + invariants de build

> **Spec validé le 2026-07-08** — à exécuter en 6 étapes séquentielles avec vérification sur l'artefact après chaque étape.

## Contexte

L'audit (`audit.md`, commit `da96ef7`, 2026-07-08) a identifié 10 items P1 critiques sur 40 correctifs au total. Au moment de l'application, **7/10 items étaient déjà corrigés dans le source** (probablement entre la date de l'audit et maintenant). Le code contient des commentaires horodatés « SUPPRIME LE 2026-07-08 » qui le confirment.

**Vrai travail P1 restant** : 3 items + vérifications systématiques + CI.

## État réel des 10 items P1

| # | Item P1 | État source | Action |
|---|---|---|---|
| 1 | `injectNonce()` supprimé | ✅ Fait (`middleware.ts:222-235`) | Vérifier (assertion) |
| 2 | JSON-LD échappés (8 sites) | ✅ Fait (`lib/jsonLd.ts`, utilisé dans 8 fichiers) | Vérifier (assertion) |
| 3 | `x-vercel-forwarded-for` only | ✅ Fait (`lib/http.ts:33-43`) | Vérifier (grep) |
| 4 | `public/robots.txt` + `public/sitemap.xml` supprimés | ✅ Fait (git status : D) | Vérifier (assertion) |
| 5 | `/a-qui.s-adresse` → `/a-qui-s-adresse` | ✅ Fait (`vercel.json:317-320`) | Vérifier (curl) |
| 6 | Trancher `/logiciels` + `/anti-pepins` | 🔍 Pages existent, redirects absents | À vérifier (assertion) |
| 7 | Rate-limit distribué | ❌ Toujours en mémoire | **À faire** |
| 8 | CSP dans `vercel.json` | ⚠️ `'unsafe-inline'` global | **À durcir** |
| 9 | `task_title` échappé notifications | ✅ Fait (`DashboardLayout.astro:331-381`) | Vérifier (grep) |
| 10 | `image/svg+xml` retiré uploads | ✅ Fait (`upload.ts:15-24`) | Vérifier (grep) |

## Les 3 items P1 restants

### P1-7 — Rate-limit distribué (Upstash Redis)

**Pourquoi.** `src/lib/rateLimit.ts:11` est un `Map` en mémoire sur du serverless Fluid. L'audit (§7, CRITIQUE 5) prouve qu'avec N instances concurrentes la limite effective est `5 × N` par minute, et un cold start la remet à zéro.

**Approche.**
1. Ajouter `@upstash/ratelimit` + `@upstash/redis` à `package.json`.
2. Nouvelle fonction `checkRateLimitDistributed(key, limit, window)` dans `src/lib/rateLimit.ts` qui :
   - Appelle Upstash avec un *sliding window* (plus robuste que fixed window).
   - Retourne un `Response 429` avec `Retry-After` + `X-RateLimit-*` headers.
   - Fallback gracieux : si Upstash est down, on **laisse passer** plutôt que de bloquer.
3. Le `Map` en mémoire est conservé comme **cache L1** (1 s).
4. Variables d'env : `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` dans `.env.example`.

**Fichiers.** `package.json`, `src/lib/rateLimit.ts`, `.env.example`, `src/middleware.ts`.

### P1-8 — Durcir le CSP `unsafe-inline` côté statique

**Pourquoi.** `vercel.json:28` autorise `'unsafe-inline'` sur **toutes** les routes. L'audit (§17) qualifie ce CSP de « ne protège PAS contre le XSS, durcit object-src / base-uri / form-action / frame-ancestors ».

**Approche (conservatrice).**
- Garder `'unsafe-inline'` sur les pages statiques (Astro 7 + Shiki bloquent une migration propre, vérifié dans Chrome par l'audit).
- **Retirer GTM** de l'autorisation globale (GTM n'est plus nécessaire sur la plupart des pages).
- Renforcer ce qui **est** possible : `script-src-elem` distinct, directives secondaires strictes.
- **Le vrai durcissement reste le middleware SSR** (nonce-based par requête), déjà en place.

**Fichiers.** `vercel.json` (CSP, ligne 28).

### P1-6 — Trancher `/logiciels` et `/anti-pepins`

**Pourquoi.** L'audit §4.4 dit que ces pages étaient inatteignables (301 en amont). Or `vercel.json` ne contient plus ces redirects dans la version actuelle. Les pages existent (`src/pages/logiciels.astro`, `src/pages/anti-pepins.astro`).

**Action.** Vérifier sur le build que les 2 URLs sont listées dans `sitemap-0.xml` et répondent 200.

**Fichiers.** `scripts/assert-build-invariants.mjs` (ajout de 2 assertions).

## Vérification systématique des 7 items déjà faits

Le script `scripts/assert-build-invariants.mjs` est déjà créé (16 assertions). Il sera exécuté après chaque fix. Items testables uniquement par grep :
- P1-1 : `grep -c "injectNonce" src/middleware.ts` doit retourner 0
- P1-3 : `grep -c "cf-connecting-ip" src/lib/http.ts` doit retourner 0
- P1-9 : `grep -c "innerHTML" src/layouts/DashboardLayout.astro` doit retourner 0 (sur la zone notifications)
- P1-10 : `grep -c "svg+xml" src/pages/api/admin/resources/upload.ts` doit retourner 0

## CI minimale (item #11 de l'audit)

**Pourquoi.** « *L'item #11 (CI) est le seul qui garantisse que le gain persiste.* »

**Approche.** `.github/workflows/ci.yml` :
1. `bun install --frozen-lockfile`
2. `bunx astro check` (type-check)
3. `bun run build` (production)
4. `node scripts/assert-build-invariants.mjs`
5. `bun run lint` (skippé si pas de config — TODO P2 #17)

**Fichiers.** `.github/workflows/ci.yml` (nouveau).

## Plan d'exécution séquentiel

```
Étape 1 — Vérifier que les 7 items déjà faits passent toutes les assertions
         ⚠️ Si une assertion échoue : corriger d'abord, ne pas empiler

Étape 2 — Item P1-6 (logiciels/anti-pepins)
         → 2 assertions ajoutées au script d'invariants
         → bun run build && node scripts/assert-build-invariants.mjs

Étape 3 — Item P1-8 (durcir CSP statique)
         → Modifier vercel.json (retirer GTM global, durcir directives)
         → bun run build && curl -I https://localhost:4321/

Étape 4 — Item P1-7 (rate-limit Upstash)
         → Installer @upstash/ratelimit + @upstash/redis
         → Refactor src/lib/rateLimit.ts (sliding window + cache L1)
         → Mettre à jour .env.example

Étape 5 — CI GitHub Actions
         → Créer .github/workflows/ci.yml

Étape 6 — Bilan + commit unique
         → "fix(audit): P1 + invariants de build"
         → Lister items corrigés + items confirmés
```

## Hors-scope explicite

- **P2 et au-delà** (perf, Tailwind 2×, streaming middleware, 185 Ko React)
- **ESLint flat config** (P2 #17) — TODO commenté dans la CI
- **Tests unitaires** (P3 #34)

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Upstash indispo pendant le build | Pas un problème — la lib est runtime only |
| CSP durci casse une page non testée | Vérifier `curl -I` sur `/`, `/blog`, `/faq` |
| `astro check` échoue sur erreurs TS préexistantes | Lancer d'abord, remonter sans corriger si non bloquant |
| L'item P1-6 est en fait déjà OK | Vérifier par `curl` au lieu de présumer |
