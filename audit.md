# Audit Technique Complet — Biscuits IA

## Score Global

| Domaine | Note |
|---|---|
| **Architecture** | **7.5 / 10** |
| **Sécurité** | **8 / 10** |
| **Performance** | **7 / 10** |
| **Qualité code** | **7.5 / 10** |
| **Scalabilité** | **6.5 / 10** |

---

## Points Forts

1. **Sécurité auth solide** — `requireAuth` / `requireAdmin` utilisent `getUser()` (validation JWT côté serveur) + lecture du rôle via `service_role` (bypass RLS). Pas de lecture du rôle depuis les JWT claims. C'est un pattern exemplaire.

2. **CSP dynamique avec nonces** — Le middleware génère un nonce cryptographique par requête et l'injecte dans les `<script type="module">`. Bien plus solide qu'un CSP statique.

3. **Headers de sécurité complets dans `vercel.json`** — `X-Frame-Options: DENY`, `HSTS`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` — tous présents.

4. **Turnstile bien implémenté** — Vérification côté serveur systématique dans les API routes `contact` et `recruitment`. Le token est vérifié AVANT le traitement des données.

5. **RLS exhaustive** — Toutes les 13 tables ont RLS activée avec des policies granulaires (SELECT/INSERT/UPDATE/DELETE par rôle). La fonction `get_my_role()` avec `SECURITY DEFINER` centralise la vérification.

6. **Inscription atelier atomique** — La fonction `atomic_workshop_register` utilise `FOR UPDATE` pour gérer les race conditions sur les places restantes.

7. **Validation côté serveur stricte** — Les API routes valident chaque champ (type, longueur, regex email) avant insertion en BDD. Pas de confiance aveugle au client.

8. **Supabase admin client bien isolé** — `createSupabaseAdminClient()` désactive `persistSession` et `autoRefreshToken`. Jamais exposé au navigateur.

9. **Cookie consent conforme RGPD** — GTM n'est chargé qu'après consentement analytics explicite. Le script Vercel Insights est aussi conditionnel.

10. **Accessibilité soignée** — `aria-expanded`, `aria-controls`, navigation clavier dans les dropdowns, `prefers-reduced-motion`, `focus-visible`, touch targets ≥ 44px.

---

## Points Faibles

### 1. Architecture

- **Duplication massive des layouts** — `Layout.astro`, `AuthLayout.astro`, `DashboardLayout.astro` dupliquent le bloc `<head>` (GTM, SchemaOrg, preconnect, fonts, criticalCSS). Tout changement doit être propagé manuellement dans 3+ fichiers.

- **Double système de formulaire contact** — `src/scripts/contactForm.ts` et `src/scripts/contactFormInit.ts` font fondamentalement la même chose avec des IDs différents (`#contact-form` vs `#cf-form`). Code mort probable ou confusion.

- **Validation dupliquée 3 fois** — La validation email/nom/message existe dans : `src/utils/formValidation.ts` (côté client React), `src/scripts/contactForm.ts` (côté client vanilla), et `src/pages/api/contact.ts` (côté serveur). Les règles diffèrent légèrement (ex: `min_message` = 20 partout, mais `name.length > 100` vs `name.length < 2`).

- **Pas de dossier partagé pour les constantes de validation** — `EMAIL_RE` est redéfini dans au moins 4 fichiers.

### 2. Qualité du Code

- **`global.d.ts` déclare `Window.gtag` deux fois** dans deux blocs `declare global`. Redondance qui passera au compilateur mais montre un manque de rigueur.

- **Fichier `db.json` à la racine** contient un dump des RLS policies — fichier de debug laissé dans le repo. Ne devrait pas être versionné.

- **`@astrojs/cloudflare` dans les dépendances** du `package.json` alors que l'adapter utilisé est `@astrojs/vercel`. Dépendance inutile.

- **Pas de type-safety sur les réponses Supabase** — Les appels `.from('table').select('...')` ne passent pas de type générique. On perd le typage fort (pas de schéma Supabase généré via `supabase gen types`).

- **`contactForm.ts` ne transmet pas le Turnstile token** — Le script vanilla de contact n'inclut pas `turnstileToken` dans le payload, alors que l'API `api/contact.ts` le vérifie. Ce formulaire échouera systématiquement avec un 400.

### 3. Sécurité

- **Rate limiter in-memory inefficace sur Vercel** — Le rate limiter dans `src/lib/rateLimit.ts` utilise un `Map` en mémoire. Sur Vercel serverless, chaque cold start repart à zéro. **Contournement trivial** en attendant le GC des instances. Pour une vraie protection : Upstash Redis ou Vercel Edge Middleware.

- **`contact_anon_insert` RLS autorise INSERT sans auth** — C'est voulu (formulaire public), mais un bot peut insérer massivement si le Turnstile est contourné. Pas de rate-limit BDD.

- **Pas de `TURNSTILE_SECRET_KEY` dans `env.d.ts`** — La variable est utilisée dans le code mais pas déclarée dans l'interface `ImportMetaEnv`. Erreur TypeScript silencieuse.

- **`PUBLIC_TURNSTILE_SITE_KEY` non déclarée dans `env.d.ts`** — Même problème pour le TurnstileWidget côté client.

- **L'API `demandes/creer.ts` n'a pas de validation de longueur** — `subject` et `description` ne sont pas bornés. Un utilisateur pourrait envoyer un texte de 10 Mo.

- **CSP ne bloque pas `unsafe-inline` pour les styles** — `style-src 'self' 'unsafe-inline'` est nécessaire pour Astro mais ouvre la porte aux attaques XSS via injection de style.

- **Pas de Turnstile sur le login/inscription** — Les routes `auth/connexion.ts` et `auth/inscription.ts` n'ont aucune protection CAPTCHA. Vulnérable au brute-force et credential stuffing malgré le rate limiter.

### 4. Performance

- **Google Fonts chargé en render-blocking** — `<link href="https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded...">` dans le `<head>` est render-blocking. Devrait utiliser `font-display: swap` (il est dans l'URL) ou être chargé en async.

- **CSS critique inliné + import global.css** — Le `criticalCSS` est inliné manuellement dans Layout.astro, mais `global.css` est aussi importé dans le frontmatter. Il y a un chevauchement de règles (box-sizing, body, etc.) envoyées deux fois.

- **Service Worker cache uniquement `/`** — Le SW ne met en cache que la page d'accueil. Pas de cache d'assets statiques (`_astro/*`), de fonts, ou de pages fréquemment visitées. Le bénéfice est quasi nul.

- **Pas de `loading="lazy"` systématique sur les images** — L'audit des composants ne montre pas d'utilisation de `<Image>` ou `<Picture>` d'`astro:assets` pour l'optimisation automatique.

- **Bundle React embarqué pour le seul CookieConsent** — Le composant `CookieConsent` est le seul composant React hydraté (`client:idle`). Le TurnstileWidget est aussi React. Cela charge ~40KB de React runtime pour deux widgets. Envisager des Web Components ou du vanilla JS.

### 5. Bonnes pratiques Astro

- **Hydration correcte** — `CookieConsent` utilise `client:idle` (bon) et le TurnstileWidget est dans un composant React importé dans du script, pas sur toutes les pages.

- **`output: 'server'` sans prerender explicite** — Toutes les pages sont SSR. Les pages statiques (`nos-missions`, `pourquoi-biscuits-ia`, pages légales, combats/*`) devraient avoir `export const prerender = true` pour être générées en SSG → gain de performance majeur et réduction des coûts Vercel.

- **Pas de `<ViewTransitions />`** — Pas d'utilisation des transitions de vue Astro pour la navigation fluide.

### 6. Dev Experience

- **Aucun linter/formatteur configuré** — Pas d'ESLint, Prettier, Biome dans le `package.json`. Aucun script `lint` ou `format`.

- **Aucun test** — Ni unitaire, ni d'intégration, ni E2E. Pas de `vitest`, `playwright`, `jest`.

- **Pas de CI/CD visible** — Pas de `.github/workflows`, pas de `vercel.json` override de build commands. Le déploiement dépend entièrement du pipeline par défaut de Vercel.

- **Pas de `.env.example`** — Les variables d'environnement requises (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`) ne sont documentées nulle part.

---

## Recommandations Prioritaires (Top 10)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Ajouter `prerender = true` aux pages statiques** (missions, combats, légales, blog index, about) | Performance +++ / Coût Vercel --- | Faible |
| 2 | **Remplacer le rate limiter in-memory** par Upstash Redis (`@upstash/ratelimit`) | Sécurité +++ | Moyen |
| 3 | **Ajouter Turnstile sur login/inscription** | Sécurité ++ (credential stuffing) | Moyen |
| 4 | **Factoriser les layouts** — Extraire un composant `BaseHead.astro` partagé pour le `<head>` (GTM, fonts, SEO, schema) | Maintenabilité +++ | Moyen |
| 5 | **Ajouter validation de longueur dans `demandes/creer.ts`** (`subject` max 200, `description` max 5000) | Sécurité + | Faible |
| 6 | **Configurer ESLint + Prettier** (ou Biome) avec scripts `lint` et `format` | Qualité code ++ | Faible |
| 7 | **Générer les types Supabase** (`supabase gen types typescript`) et les utiliser dans le client | Type-safety +++ | Moyen |
| 8 | **Supprimer `contactForm.ts` ou le corriger** (pas de Turnstile token = le formulaire ne fonctionne pas) | Bug fix critique | Faible |
| 9 | **Déclarer toutes les env vars dans `env.d.ts`** (`TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `GTM_ID`) | Type-safety + | Faible |
| 10 | **Ajouter un `.env.example`** avec la liste des variables requises | DX ++ | Faible |

---

## Recommandations Avancées

1. **Remplacer React par des Web Components ou vanilla JS pour Cookie Consent / Turnstile** — Économise ~40KB de runtime React. Le CookieConsent est un simple toggle de localStorage, un `<dialog>` natif avec 50 lignes de JS suffit.

2. **Implémenter `supabase db push` / migrations versionnées** — Le fichier unique `migration.sql` ne supporte pas les migrations incrémentales. Utiliser `supabase migration new` pour chaque changement.

3. **Ajouter des tests E2E** avec Playwright pour les flux critiques (inscription, login, contact, inscription atelier).

4. **Configurer un pipeline CI** (GitHub Actions) : lint → type-check → build → test.

5. **Optimiser le SW** — Cache les assets statiques (`/_astro/**`), les fonts Google, et implémenter une stratégie `stale-while-revalidate` pour les pages publiques.

6. **Ajouter `Permissions-Policy` côté Astro middleware** en plus de vercel.json (redondance intentionnelle pour le cas Edge).

7. **Unifier la validation** dans un module partagé `src/lib/validators.ts` utilisé côté client ET serveur (isomorphique). Supprimer les 3 copies.

8. **Ajouter un index `GIN` sur `system_logs.metadata`** si vous requêtez le JSONB.

9. **Implémenter le pattern Repository** pour les accès Supabase dans les API routes — actuellement chaque route fait directement `.from('table')`. Un `src/lib/repositories/contacts.ts` améliorerait testabilité et cohérence.

10. **Ajouter des headers `Cache-Control` appropriés** dans le middleware pour les assets statiques et les pages SSG (actuellement seul le CSP est injecté).

---

## Conclusion

| Critère | Évaluation |
|---|---|
| **Niveau du projet** | **Intermédiaire avancé** — Architecture propre, sécurité au-dessus de la moyenne, mais manques sur le tooling (tests, lint, CI) qui empêchent de qualifier « production-ready » |
| **Risques principaux** | 1. Rate limiter inefficace sur serverless → vulnérable au spam/brute-force. 2. `contactForm.ts` cassé (pas de Turnstile token). 3. Aucun test = régressions silencieuses |
| **Potentiel du projet** | **Élevé** — La base de code est bien structurée, le modèle Supabase est solide, les patterns auth sont professionnels. Avec ESLint, tests E2E, prerender, et le remplacement du rate limiter, le projet peut atteindre un niveau production-ready |
