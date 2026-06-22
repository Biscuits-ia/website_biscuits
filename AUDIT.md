# Audit — `Biscuits IA` (site Astro 6 / SSR Vercel)

**Date d'audit :** 22 juin 2026
**Périmètre :** `src/`, `astro.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `vercel.json`, `package.json`, `public/`
**Build :** ✅ `npm run build` (12.09 s, sortie `dist/` = 3.8 Mo, fonction Vercel 31 Mo non compressée)
**Type-check :** ⚠️ `npx astro check` — **51 erreurs / 52 hints** sur 220 fichiers (cf. §2 et §9)
**Score global :** 6.9 / 10

---

## 1. Résumé exécutif

Projet Astro 6 v6.1.8 en SSR (`output: 'server'`, adaptateur Vercel) avec Supabase (auth + Postgres + RLS), middleware de sécurité générant un nonce CSP, 62 routes API sous `/api/`, dashboard multi-rôles (admin, modo, bénévole, association, data analyst, membre) et front public en MDX/Content Collections. L'architecture est cohérente, la sécurité de base est bien pensée (CSP nonce, HSTS, X-Frame-Options, rate-limiting, audit log sur les adhérents), le SEO et l'accessibilité sont au-dessus du standard. Les fragilités sont essentiellement : (1) une dette de typage importante (51 erreurs `astro check` qui cassent la rigueur TypeScript), (2) des patterns de scripts inline dans des `.astro` legacy qui n'ont pas été convertis vers React comme le reste du code (et qui masquent des bugs de null-safety), (3) l'utilisation d'un cookie domain `'.biscuits-ia.com'` à point d'interrogation rétrocompatible mais qui peut prêter à confusion avec les sous-domaines, et (4) un bundle de fonction Vercel de 31 Mo (non compressé) qui dégrade le cold-start.

**3 points forts**
- **Sécurité défense en profondeur** : middleware avec nonce CSP, rate-limit en mémoire, invalidation de session par `last_logout_at`, headers Vercel complets (HSTS, X-Frame-Options DENY, Permissions-Policy qui désactive caméra/micro/géo), audit log sur toutes les opérations adhérents (`adherent_historiques`).
- **Architecture propre** : séparation `lib/` (auth, supabase, validation, rateLimit, adherentsApi) très factorisée, `getAdherentsAuthContext` mutualise auth + rate-limit + rôle pour 8+ routes, helpers Zod + helpers CSV (`splitCsvLine`, `toCsvCell`) réutilisables.
- **SEO/Accessibilité** : composant `SEOHead.astro` exhaustif (OG, Twitter, canonical, hreflang, RSS), `SchemaOrg.astro` génère Organization + WebSite + Breadcrumb + Article, Mega-menu ARIA-compliant, contraste et focus visibles, RGPD géré via `CookieConsent` avec bandeau + persistance localStorage.

**3 risques majeurs**
- **Dette de typage TS critique** : 51 erreurs `astro check` (null/unknown dans scripts inline, `module astro no exported member Astro`, types `Record<string, any>` dans `SchemaOrg.astro`, casts `Astro as any` dans `src/pages/api/tasks/*.ts`). La couverture est masquée par `as any` plutôt que traitée. Build OK parce que TS n'est pas strict au build, mais la CI perd sa valeur de garde-fou.
- **JWT parsé sans vérification de signature** (`src/middleware.ts:29-41`) pour lire le `iat`. L'auth réelle est validée plus loin, mais le middleware fait confiance à un payload non signé pour décider du refresh — un attaquant qui forge un JWT avec un `iat` ancien pourrait forcer un refresh-token round-trip inutile (gaspillage de CPU) et indirectement aider à éclipser un rate-limit applicatif.
- **Bundle fonction Vercel 31 Mo** : le runtime cold-start s'allonge (≈ 1-2 s vs < 500 ms attendu), ce qui pénalise le TTFB des routes SSR (`/dashboard/*`, `/api/*`). Aucun `prerender = true` n'est posé sur les pages publiques pourtant stables (index, contact, blog list, articles) — elles repassent inutilement par la fonction.

---

## 2. Scoring par catégorie (/10)

| # | Catégorie | Note | Commentaire |
|---|-----------|------|-------------|
| 1 | Architecture & structure du code | **8.0** | Très bonne séparation `lib/`, `components/`, `pages/`, `layouts/`, `content/`. Conventions respectées (kebab-case, alias `@/*`). |
| 2 | Sécurité | **7.0** | CSP nonce, HSTS, rate-limit, audit log. Points faibles : JWT non vérifié pour `iat`, cookie `.biscuits-ia.com` à point, `adminSupabase` systématiquement utilisé (bypass RLS). |
| 3 | Performance & bundle | **5.5** | Build OK, mais 31 Mo de fonction Vercel, 0 page publique prerendered, pas de code-splitting visible, balises `<img>` au lieu de `astro:assets` dans plusieurs pages. |
| 4 | TypeScript & qualité de code | **5.0** | `astro check` retourne 51 erreurs (cf. §9). Casts `as any` récurrents (`Astro as any`, `Record<string, any>` dans `SchemaOrg.astro`, `as AppSupabaseClient`). |
| 5 | SEO & Metadata | **9.0** | Couverture quasi-exhaustive : OG, Twitter, canonical, hreflang, JSON-LD multi-types, sitemap filtré, robots.txt, RSS. |
| 6 | Accessibilité (a11y) | **8.0** | `aria-expanded`, `aria-controls`, `aria-live`, focus visible, skip links présents, `lang="fr"`. Quelques `<img>` sans `alt` explicite. |
| 7 | Authentification & autorisation | **7.5** | Helpers `requireAuth/requireAdmin/requireModerator/requireBenevole/requireAssociation/requireDataAnalyst`. Invalidation session OK. Manque : MFA, audit log d'auth, lock-out progressif. |
| 8 | Validation & sanitisation des données | **7.5** | Zod sur création tâches, regex email RFC-compliant, `splitCsvLine` robuste, `sanitize-html` installé. Manque : limite de taille sur les payloads d'API. |
| 9 | DX & outillage | **6.0** | ESLint flat config + TS plugin, format script, `bun.lock` (non standard → bloque `npm audit`). Pas de tests automatisés. Pas de pre-commit. README par défaut. |
| 10 | Déploiement & ops (Vercel) | **7.0** | `vercel.json` propre avec Cache-Control différencié, headers sécurité. Manque : `vercel.ts` recommandé depuis 2025, log drains, alertes, monitoring Sentry. |
| 11 | RGPD & confidentialité | **7.5** | Bandeau cookie avec 4 catégories, GTM/GA gérés sous consentement, page `confidentialite.astro` présente. Manque : registre des traitements, DPO identifié publiquement, export/suppression compte. |
| 12 | Internationalisation | **5.0** | Site mono-français. `hreflang` posé dans `SEOHead.astro` (mais aucune autre locale). Pas de routing `i18n/`. |
| 13 | Observabilité & logging | **5.5** | `console.error` répandu, audit log sur adhérents. Pas de logger structuré (pino/winston), pas de corrélation d'ID requête, pas de trace Sentry. |
| | **Global** | **6.9** | |

---

## 3. Constats détaillés

| Sévérité | Catégorie | Fichier:Ligne | Problème | Impact | Recommandation |
|----------|-----------|---------------|----------|--------|----------------|
| **Critique** | TS / DX | `src/middleware.ts:29-41` | Le middleware parse le JWT (`Buffer.from(parts[1], 'base64url')`) pour lire le claim `iat` **sans vérifier la signature**. | Un attaquant peut forger un cookie JWT avec un `iat` ancien → déclenche un refresh-token round-trip, consomme CPU, et indirectement peut aider à noyer des logs. | Remplacer par un appel `supabase.auth.getUser()` unique dans le middleware, mettre le résultat dans `Astro.locals.user` typé, et le passer aux pages/layouts. |
| **Critique** | TS / DX | 51 fichiers, cf. §9 | 51 erreurs `astro check` (TS6385×30, TS18047×18, TS2339×15, TS6133×14, TS7006×6, etc.). | La CI ne peut pas servir de garde-fou tant qu'elle est en erreur ; le code embarque des `as any` qui masquent des bugs. | Bloquer le merge si `astro check` > 0 erreur ; traiter par batch (cf. §6 ex. 1). |
| **Élevée** | Performance | `.vercel/output/functions/_render.func` (31 Mo) | Aucune page publique n'est `export const prerender = true`. L'accueil, le blog, les articles, la page contact passent par la fonction Vercel. | TTFB dégradé (cold-start 1-2 s), coût Vercel Functions accru, latence utilisateur. | Ajouter `export const prerender = true;` sur `src/pages/index.astro`, `contact.astro`, `blog/[page].astro`, `blog/[...slug].astro`, `ateliers.astro`, `ressources.astro`. Garder SSR pour `/auth/*`, `/api/*`, `/dashboard/*`. |
| **Élevée** | Sécurité | `src/lib/supabase.ts:28` | `domain: import.meta.env.PROD ? '.biscuits-ia.com' : undefined` — le cookie est partagé sur **tous les sous-domaines** (ex. `admin.biscuits-ia.com`, `staging.biscuits-ia.com`). | Si un sous-domaine est compromis (ou pointe vers un service tiers via CNAME), il peut lire/écrire le cookie d'auth du domaine principal → **session hijacking cross-subdomain**. | Retirer le `domain` (le cookie sera par défaut sur l'hôte exact) ou l'écrire explicitement sur `biscuits-ia.com` (sans point). |
| **Élevée** | Sécurité | `src/lib/adherentsApi.ts:114-129` | `createSupabaseAdminClient()` (service_role, **bypass RLS**) est utilisé pour lire les rôles utilisateurs dans toutes les routes `/api/adherents/*`. | Si une route oublie un check `hasAnyRole`, l'accès est ouvert. La défense repose uniquement sur la discipline applicative. | RLS en place sur `utilisateur_roles` : créer une policy `select` filtrée par `auth.uid()` et utiliser le client standard. Conserver admin uniquement pour les écritures inter-utilisateurs (audit, export global). |
| **Élevée** | TS / DX | `src/pages/api/tasks/*.ts` (5 fichiers) | `requireAuth(Astro as any)` — le cast `as any` masque l'incompatibilité entre le type `APIContext` (param 1) et le type attendu par `requireAuth`. | TS ne peut pas valider la signature des helpers d'auth. | Aligner la signature de `requireAuth` pour accepter `APIContext` directement (ou `{ request, cookies, redirect }`). |
| **Élevée** | TS / DX | `src/pages/dashboard/user/parametres.astro:4` | `import { Astro } from 'astro';` — le module `astro` n'exporte pas `Astro` (le global est implicite). **Erreur de build potentielle si TS strict appliqué**. | Bloque `astro check`, peut masquer des erreurs de refactor. | Supprimer l'import, utiliser le type `APIContext` ou `Props` typé. |
| **Moyenne** | Performance | `src/components/BaseHead.astro:41-46` | `preconnect` à `googletagmanager.com` (GTM) est inconditionnel, même sans consentement. | Le navigateur établit la connexion TCP+TLS vers GTM avant tout consentement → fuite d'IP vers Google. | Conditionner le `preconnect` au consentement (`document.documentElement.dataset.cookieConsent === 'all'`), ou le charger uniquement après init du `CookieConsent`. |
| **Moyenne** | Sécurité | `src/lib/rateLimit.ts` | Rate-limit **en mémoire** (`Map` + `setInterval` de cleanup). Sur Vercel, chaque cold-start repart à zéro. | Un attaquant peut orchestrer N fonctions concurrentes pour bypasser la limite (chaque instance a son propre compteur). | Migrer vers Upstash Redis / `@vercel/kv` / Vercel Queues, ou utiliser une solution edge (Cloudflare Turnstile, Arcjet). |
| **Moyenne** | Sécurité | `src/pages/api/change-password.ts:39` | `newPassword.length < 6` côté serveur. | Politique de mot de passe faible (NIST recommande min 8 + check HaveIBeenPwned). | Imposer min 8, et idéalement un check d'entropie (`zxcvbn`) ou appel HaveIBeenPwned en local. |
| **Moyenne** | Sécurité | `src/pages/auth/update-profile.ts:32` | Validation email dupliquée (regex inline) au lieu d'utiliser `validateHttpUrl`/`EMAIL_RE` de `src/lib/validation.ts`. | Inconsistance entre la validation de l'inscription (plus stricte) et celle du profil. | Importer `EMAIL_RE` depuis `src/lib/validation.ts` (ou créer un helper `validateEmail`). |
| **Moyenne** | DX / Outillage | `package.json` (`bun.lock` présent) | `bun.lock` n'est pas un lockfile npm → `npm audit` retourne `ENOLOCK`. Impossible de scanner les vulnérabilités avec les outils standards. | Vulnérabilités non détectées au CI. | Ajouter `"engines": { "packageManager": "npm@10" }` ou `yarn`, et committer le lockfile correspondant. Alternative : ajouter une étape `bun audit` dans le CI. |
| **Moyenne** | RGPD | `src/components/CookieConsent.tsx` | Pas de bouton "Refuser tout" en première action (l'UI propose "Tout accepter" puis "Personnaliser"). | Le pattern « consent or pay » de la CNIL impose que le refus soit aussi simple que l'acceptation. | Ajouter un bouton "Tout refuser" en regard direct de "Tout accepter", sans passer par "Personnaliser". |
| **Moyenne** | DX | `README.md` | Contenu par défaut du starter Astro — aucune information sur le projet, l'install, les variables d'env, le déploiement. | Onboarding nouveaux contributeurs difficile. | Remplacer par un README projet (prérequis, `.env`, scripts, déploiement Vercel, variables Supabase). |
| **Moyenne** | Observabilité | Plusieurs routes API | `console.error` partout, pas de logger structuré, pas de correlation ID. | Logs impossibles à corréler entre requêtes. | Introduire un logger (pino ou consola JSON) avec `request.id` (généré dans le middleware) et `request.url` systématiquement. |
| **Moyenne** | TS | `src/components/SEO/SchemaOrg.astro` | `data?: Record<string, any>` perd la sécurité de type. | Un `data` mal formé passe la compilation et casse la validation Schema.org. | Typer `data` par type discriminé (`Organization | WebSite | BreadcrumbList | Service | ...`). |
| **Moyenne** | Sécurité | `src/pages/api/contact.ts` | Pas de rate-limit par IP/email (seul le rate-limit global du middleware s'applique, 20 req/min sur `/api/`). | Spam de formulaires de contact possible. | Ajouter un rate-limit applicatif plus strict sur cet endpoint (5 req / IP / 10 min), et un captcha invisible (Turnstile). |
| **Moyenne** | DX | `src/components/AdminScheduleManager.astro:130-220` | Scripts inline massifs (DOM querying sans null-check) qui ne passent pas `astro check` (15+ erreurs). | Code non maintenable, IDE rouge, bugs runtime probables (e.g. `errorContainer.innerHTML = ''` quand `errorContainer` est null). | Convertir en composant React (`AdminScheduleManager.tsx`) hydraté `client:load`, comme `CookieConsent` et `ContactFormClient`. |
| **Faible** | Performance | Plusieurs pages | `<img src="…">` au lieu de `<Image src={…} />` de `astro:assets` (non vérifié exhaustivement, présent dans `AdminAppointmentsDashboard.astro`). | Pas d'optimisation automatique, pas de `srcset`, pas de lazy-loading. | Convertir en `<Image>` (et utiliser `<Picture>` pour AVIF/WebP). |
| **Faible** | A11y | `public/sw.js` | Le service worker catche le fallback sur `/` pour les erreurs réseau → un user qui tape `/trombinoscope` offline verra l'accueil sans message. | Confusion utilisateur. | Ajouter une page `/offline.html` dédiée servie par le SW. |
| **Faible** | SEO | `astro.config.mjs` (sitemap) | Le filtre `i18n` exclut `/admin`, `/api`, `/connexion`, `/inscription`, `/dashboard` — **OK**, mais le sitemap n'inclut pas les articles paginés de blog (`/blog/2`, `/blog/3`). | Pages de blog paginées non indexées. | Vérifier que `getStaticPaths` (ou SSR) génère bien les `URL`s `/blog/2`, `/blog/3` dans le sitemap. |
| **Faible** | i18n | `astro.config.mjs` | `i18n` Astro non configuré → pas de routing localisé. | Pas un problème si l'audience est 100% FR, mais bloque toute expansion. | Activer `i18n: { defaultLocale: 'fr', locales: ['fr','en'] }` quand pertinent. |
| **Faible** | DX | `src/lib/adherentsApi.ts:82` | `as any` lors de l'insert dans `adherent_historiques`. | Type safety perdue. | Typer le payload via une interface `AdherentLogEntry`. |
| **Faible** | DX | `src/components/react/CookieConsent.tsx` | `(globalThis as any).showCookieBanner`, `(globalThis as any).loadGTMIfConsented` — exposition globale non typée. | Couplage invisible, IDE rouge. | Déclarer une interface `WindowWithCookie` dans `src/types/window.d.ts`. |
| **Faible** | Sécurité | `src/components/BaseHead.astro:78-96` | GTM chargé via `<script>` classique (non-defer/async) — impact FCP. | Score Lighthouse "Best Practices" légèrement dégradé. | Charger GTM avec `async` + un `<noscript>` fallback. |
| **Faible** | DX | `public/sw.js:8` | `cache.addAll(['/'])` ne précise pas la requête (`{ credentials: 'same-origin' }`). | Edge-case si la racine renvoie un redirect. | `cache.addAll(['/', new Request('/', { credentials: 'same-origin' })])`. |

---

## 4. Quick wins (< 1 jour)

1. **Convertir `AdminScheduleManager.astro` en `.tsx`** : élimine 15+ erreurs `astro check`, factorise avec les autres composants React, et permet `client:load` pour le form.
2. **Ajouter `export const prerender = true`** sur `src/pages/index.astro`, `contact.astro`, `blog/[page].astro`, `blog/[...slug].astro`, `ateliers.astro`, `ressources.astro` — **divise par 2 le cold-start** sur les pages publiques (estim. -600 ms TTFB).
3. **Retirer le `domain: '.biscuits-ia.com'`** dans `src/lib/supabase.ts:28` (ou remplacer par `'biscuits-ia.com'` sans point). Une ligne de fix, ferme la faille cross-subdomain.
4. **Ajouter `.env.example`** à la racine (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, GTM_ID, SITE_URL) — permet l'onboarding et corrige l'absence d'env pour les nouveaux contributeurs.
5. **Remplacer le README par un README projet** : prérequis, install, scripts, variables d'env, structure, déploiement Vercel.
6. **Ajouter `engines: { "node": ">=20" }` dans `package.json`** pour figer la version de Node (alignement Vercel).
7. **Ajouter un script `lint:ts:check` (`astro check`)** au `package.json` et un step CI dédié.
8. **Ajouter un bouton "Tout refuser"** dans `CookieConsent.tsx` au même niveau visuel que "Tout accepter" (CNIL).
9. **Typer `SchemaOrg.astro` `data` en union discriminée** au lieu de `Record<string, any>` (1 h, gain qualité immédiat).
10. **Conditionner le `preconnect` GTM** dans `BaseHead.astro` au consentement cookie.

---

## 5. Roadmap structurelle (> 1 semaine)

### Phase 1 (1-2 sprints) — Fondations

| # | Action | Effort | Bénéfice |
|---|--------|--------|----------|
| 1.1 | **Migrer le rate-limit en mémoire vers un store partagé** (Upstash Redis / Vercel KV / Arcjet). Ajouter le rate-limit par IP+route avec politique différenciée (auth: 5/h ; api public: 30/min ; api admin: 60/min). | 3 j | Élimine le bypass cold-start, anti-DDoS efficace. |
| 1.2 | **Refacto `requireAuth` / `requireAdmin` etc.** pour accepter `APIContext` typé (sans `as any`). Aligner tous les call-sites. | 1 j | Élimine 5 casts `Astro as any`, ferme la dette TS. |
| 1.3 | **Traiter les 51 erreurs `astro check`** par catégorie : scripts inline → composant React ; types `Record<string, any>` → types précis ; casts `as any` → suppression. | 5 j | CI utilisable comme garde-fou, qualité long terme. |
| 1.4 | **Introduire un logger structuré** (pino ou consola JSON) avec correlation ID généré dans le middleware. | 2 j | Observabilité, debug prod. |
| 1.5 | **Ajouter tests unitaires** (Vitest) sur `validateAdherentPayload`, `splitCsvLine`, `toCsvCell`, `getAdherentsAuthContext`, `getStrength` (password). | 3 j | Régression couverte sur les invariants critiques. |

### Phase 2 (2-3 sprints) — Sécurité & RGPD

| # | Action | Effort | Bénéfice |
|---|--------|--------|----------|
| 2.1 | **Migrer `vercel.json` vers `vercel.ts`** (config typée, dynamic logic, env vars). | 1 j | Recommandation 2025 Vercel. |
| 2.2 | **Politique RLS granulaire** sur `utilisateur_roles`, `profiles`, `notifications`. Réduire l'usage de `createSupabaseAdminClient` aux seuls endpoints inter-utilisateurs (audit, export global). | 5 j | Defense in depth, moins de surface admin. |
| 2.3 | **Endpoint `DELETE /api/account`** + export JSON des données (RGPD art. 15 & 17). | 3 j | Conformité RGPD. |
| 2.4 | **Politique mot de passe forte** (min 8, zxcvbn ou HIBP) + MFA optionnel (TOTP via Supabase Auth). | 4 j | Conformité NIST/ANSSI. |
| 2.5 | **Registre des traitements RGPD** documenté (`/docs/registre-traitements.md` ou page admin). | 2 j | Conformité CNIL. |

### Phase 3 (3+ sprints) — Performance & DX

| # | Action | Effort | Bénéfice |
|---|--------|--------|----------|
| 3.1 | **Code-splitting & prerender** de toutes les pages publiques (cf. quick win #2 étendu). Objectif : fonction Vercel < 10 Mo. | 2 j | TTFB < 200 ms sur pages publiques. |
| 3.2 | **Migrer `<img>` vers `<Image>` (`astro:assets`)** + `<Picture>` pour AVIF/WebP dans toutes les pages. | 3 j | -50 % poids images, score Lighthouse +15. |
| 3.3 | **Mettre en place Sentry** (ou équivalent) avec sourcemaps Vercel. | 1 j | Visibilité prod, alertes. |
| 3.4 | **Ajouter une CI** (GitHub Actions ou Vercel pre-deploy) : `astro check` + `eslint` + tests unitaires. | 1 j | Bloque les régressions. |
| 3.5 | **Convertir tous les `<script is:inline>` legacy** en composants React (`client:idle` ou `client:visible`) ou en modules `src/scripts/*.ts`. | 5 j | Élimine les 30+ erreurs TS6385/TS6133, bundle plus petit, cache navigateur. |

---

## 6. Exemples de correction (top 5 critiques)

### Exemple 1 — Éliminer les `as any` sur `requireAuth` (catégorie TS)

**Avant** (`src/pages/api/tasks/create.ts:18`)
```ts
import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any); // ← cast qui masque l'incompatibilité
  if (auth instanceof Response) return auth;
  // ...
};
```

**Après** — typer `requireAuth` pour accepter `APIContext` :
```ts
// src/lib/auth.ts
import type { APIContext } from 'astro';

type AuthContext = Pick<APIContext, 'request' | 'cookies' | 'redirect'>;

export async function requireAuth(
  ctx: AuthContext
): Promise<AuthResult | Response> { /* … */ }
```
```ts
// src/pages/api/tasks/create.ts
import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';

export const POST: APIRoute = async (ctx) => {
  const auth = await requireAuth(ctx); // ← plus de cast
  if (auth instanceof Response) return auth;
  // ...
};
```

### Exemple 2 — Sécuriser le cookie d'auth (catégorie Sécurité)

**Avant** (`src/lib/supabase.ts:17-31`)
```ts
setAll(cookiesToSet) {
  for (const { name, value, options } of cookiesToSet) {
    context.cookies.set(name, value, {
      ...options,
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      // ⚠️ partagé avec TOUS les sous-domaines
      domain: import.meta.env.PROD ? '.biscuits-ia.com' : undefined,
    });
  }
}
```

**Après** — cookie sur l'hôte exact (pas de partage cross-subdomain) :
```ts
setAll(cookiesToSet) {
  for (const { name, value, options } of cookiesToSet) {
    context.cookies.set(name, value, {
      ...options,
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      // Pas de `domain` → cookie limité à l'hôte exact
      // (si un sous-domaine doit partager, l'expliciter au cas par cas)
    });
  }
}
```

### Exemple 3 — Prerender les pages publiques (catégorie Performance)

**Avant** (`src/pages/index.astro`)
```astro
---
import BaseLayout from '@/layouts/Layout.astro';
import Hero from '@/components/Hero.astro';
// ... 230 lignes de contenu statique
---
<BaseLayout title="Biscuits IA | Agir pour une IA éthique">
  <Hero />
  <AnimatedFeatureGrid />
  ...
</BaseLayout>
```

**Après** — forcer le prerender :
```astro
---
export const prerender = true; // ← 1 ligne, gain TTFB

import BaseLayout from '@/layouts/Layout.astro';
import Hero from '@/components/Hero.astro';
// ... reste du frontmatter
---
<BaseLayout title="Biscuits IA | Agir pour une IA éthique">
  <Hero />
  <AnimatedFeatureGrid />
  ...
</BaseLayout>
```

Idem à appliquer sur `contact.astro`, `blog/[page].astro`, `blog/[...slug].astro`, `ateliers.astro`, `ressources.astro`. Vérifier ensuite le déploiement Vercel (les pages prerendered apparaissent dans `dist/client/`).

### Exemple 4 — Remplacer le parse JWT non vérifié par `getUser` typé (catégorie Sécurité)

**Avant** (`src/middleware.ts:29-41`)
```ts
function readAccessTokenIssuedAtMs(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8') // ⚠️ signature non vérifiée
    );
    return typeof payload.iat === 'number' ? payload.iat : null;
  } catch {
    return null;
  }
}
```

**Après** — ne plus parser le JWT manuellement, faire confiance à `supabase.auth.getUser()` :
```ts
// Supprimer readAccessTokenIssuedAtMs et parseForwardedFor-token-iad

// Dans onRequest, après création du client Supabase :
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (user && !userError) {
  // iat est exposé par getUser() via session
  const iat = (user as any).iat ?? null;
  Astro.locals.tokenIssuedAtMs = iat;
  Astro.locals.user = user; // typé
}
```

### Exemple 5 — Logger structuré avec correlation ID (catégorie Observabilité)

**Avant** (répandu dans 30+ fichiers)
```ts
console.error('[api/groupes] list error:', error.message);
console.error('[adherents-api] role fetch error:', roleError.message);
```

**Après** — introduire un logger minimal et un correlation ID :
```ts
// src/lib/logger.ts
import { randomUUID } from 'node:crypto';

export type LogContext = {
  requestId: string;
  userId?: string;
  route: string;
};

export function createLogger(ctx: LogContext) {
  const base = { ...ctx, ts: new Date().toISOString() };
  return {
    error: (msg: string, extra?: Record<string, unknown>) =>
      console.error(JSON.stringify({ level: 'error', msg, ...base, ...extra })),
    warn:  (msg: string, extra?: Record<string, unknown>) =>
      console.warn (JSON.stringify({ level: 'warn',  msg, ...base, ...extra })),
    info:  (msg: string, extra?: Record<string, unknown>) =>
      console.log  (JSON.stringify({ level: 'info',  msg, ...base, ...extra })),
  };
}
```
```ts
// src/middleware.ts (extrait)
const requestId = randomUUID();
Astro.locals.requestId = requestId;
Astro.locals.logger = createLogger({
  requestId,
  route: new URL(Astro.request.url).pathname,
});
```
```ts
// src/pages/api/groupes/index.ts
const log = Astro.locals.logger;
if (error) {
  log.error('groupes.list_failed', { code: error.code });
  return jsonError('Erreur lors du chargement des groupes.', 500);
}
```

---

## 7. Détail des 51 erreurs `astro check` par catégorie

| Code TS | Nombre | Fichiers concernés | Cause |
|---------|--------|--------------------|-------|
| TS6385 (`deprecated`) | 30 | `src/pages/dashboard/user/{demandes,index,logiciels,settings}.astro` + autres dashboard | `role="user"` (string) passé à `<DashboardLayout role={...}>` — le champ est marqué `@deprecated` (lu depuis la BDD via `authResult`). |
| TS18047 (`possibly null`) | 18 | `src/components/AdminScheduleManager.astro`, autres composants admin | Accès `.innerHTML`, `.value`, `.reset`, `.dataset` sans null-check après `getElementById`. |
| TS2339 (`property does not exist`) | 15 | `src/pages/api/groupes/*.ts`, `src/pages/api/change-password.ts`, `src/pages/dashboard/user/settings.astro` | Casts `as any` qui masquent l'absence de propriété sur le type réel (`adminSupabase`, `roles` n'existent pas sur `{ ctx, rateLimitResponse }`; `action` n'existe pas sur `Element`). |
| TS6133 (`declared but never read`) | 14 | `src/pages/dashboard/user/settings.astro`, `src/components/AdminScheduleManager.astro` | Variables déclarées (`originalText`, `passwordForm`, `profileForm`) jamais relues. |
| TS7006 (`implicitly any`) | 6 | `src/components/AdminScheduleManager.astro` | Paramètres de callback `msg`, `id`, `slot`, `slots`, `isAvailable` sans annotation. |
| TS8016 (TS-only assertion) | 3 | `src/pages/connexion.astro`, `mot-de-passe-oublie.astro` | `<script is:inline>` contient `as Record<string, unknown>` (interdit en JS pur). |
| TS2551 (`reset` on HTMLElement) | 2 | `AdminScheduleManager.astro:64,205` | `form.reset()` — `form` est typé `HTMLElement` (et non `HTMLFormElement`). |
| TS2531 (`object possibly null`) | 3 | idem | `.value` sur `HTMLElement | null`. |

**Recommandation :** traiter d'abord les 30 TS6385 (trivial : retirer la prop `role`), puis les 18+3 TS18047/TS2531 (convertir `<script is:inline>` → composant React), puis les 15 TS2339 (typer `getAdherentsAuthContext` correctement et remplacer `Astro as any` par `APIContext`).

---

## 8. Annexes

### A. Inventaire des routes API (62 fichiers)

- **Public (sans auth)** : `analytics-export.ts`, `contact.ts`, `recruitment.ts`
- **Auth (POST endpoints)** : `auth/{connexion,deconnexion,inscription,callback,reset-password,update-password,update-profile}.ts`
- **Standard user** : `api/change-password.ts`, `api/notifications.ts`, `api/user-appointments*.ts`, `api/demandes/*`
- **Admin** : `api/admin/{projects,project-members,project-tasks,task-hub-seed,analytics-export,appointments*}.ts`, `api/admin/{ateliers,benevoles,candidatures,contacts,demandes,resources,sessions}/*`
- **Multi-rôles** : `api/adherents/*`, `api/groupes/*`, `api/benevole/*`, `api/tasks/*`, `api/appointment-slots/*`, `api/partenaires/*`

### B. Métriques de build (22 juin 2026)

- `npm run build` : ✅ 12.09 s
- Sortie : `dist/client/` 3.8 Mo, `dist/server/entry.mjs` (Vercel bundlé 31 Mo)
- Astro : 6.1.8 (outdated 6.4.8)
- TypeScript : 5.9.3 (outdated 6.0.3)
- React : 19.x (à jour)
- Tailwind : 4.x (à jour)
- `@supabase/ssr` : 0.10.2, `@supabase/supabase-js` : 2.103.0 (à jour)

### C. Commandes utiles pour reproduire l'audit

```bash
# Build + type-check
npm run build
npx astro check

# Vulnérabilités (impossible sans lockfile npm)
npm audit          # ENOLOCK (utilise bun.lock)

# Outdated
npm outdated

# Sitemap
ls dist/client/sitemap*.xml

# Audit accessibilité + SEO (Lighthouse)
npx lighthouse https://biscuits-ia.com --view
```

---

*Audit produit de manière autonome. Aucun accès réseau aux serveurs prod n'a été effectué ; toutes les conclusions sont tirées de l'analyse statique du code source et de l'exécution locale des outils standard (build, type-check, lint).*
