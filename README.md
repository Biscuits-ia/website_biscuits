# Biscuits IA — Site officiel

Site de l'association **Biscuits IA** ([biscuits-ia.com](https://biscuits-ia.com)) — une association Loi 1901 d'intérêt général qui rend l'IA accessible aux associations, collectivités et petites structures, sans jargon et sans but lucratif.

Stack : **Astro 6** (SSR + Vercel adapter), **React 19** (composants interactifs), **Supabase** (auth + Postgres + RLS), **Tailwind 4**, **MDX** (blog & ressources).

---

## Prérequis

- **Node ≥ 20.3** (cf. `package.json` → `engines`)
- npm ≥ 10 (ou pnpm / yarn)
- Un projet [Supabase](https://supabase.com) avec les migrations du dossier `supabase/` appliquées

## Installation

```sh
# 1. Installer les dépendances
npm install

# 2. Copier le template d'env et le remplir
cp .env.example .env

# 3. Lancer le serveur de dev (http://localhost:4321)
npm run dev
```

## Variables d'environnement

Toutes les variables sont documentées dans `.env.example`. Récapitulatif :

| Variable | Usage | Source |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Clé publique anon (client + middleware) | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin (bypass RLS, **server-only**) | idem |
| `SITE_URL` | URL canonique du site (SEO) | `https://biscuits-ia.com` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Email transactionnel (SMTP OVH) | Manager OVH → Emails |
| `SMTP_FROM` / `SMTP_REPLY_TO` | Adresses From / Reply-To (optionnel) | idem |
| `CRON_SECRET` | Auth des cron jobs Vercel | `openssl rand -hex 32` |

## Scripts

```sh
npm run dev          # Serveur de dev (HMR)
npm run build        # Build prod → dist/
npm run preview      # Preview du build local
npm run check        # Type-check (astro check) — cible 0 erreur
npm run lint         # ESLint (src/**/*.{ts,tsx,astro})
npm run lint:fix     # ESLint --fix
npm run format       # Prettier --write
npm run format:check # Prettier --check (CI)
```

## Structure du projet

```
src/
├── components/       # Composants Astro statiques + sous-dossier react/ (client islands)
├── content/          # Content Collections (blog, ressources)
├── layouts/          # Layouts Astro (Layout, AuthLayout, BlogLayout, DashboardLayout)
├── lib/              # Logique partagée (auth, supabase, validation, rateLimit)
├── pages/            # Routes : pages Astro + endpoints API
│   ├── api/          # 62 routes API sous /api/*
│   ├── auth/         # Pages d'authentification
│   ├── blog/         # Blog (Content Collections + SSR)
│   └── dashboard/    # Back-office (admin, modo, bénévole, association, data, user)
├── styles/           # CSS global + Tailwind 4
└── types/            # Types TypeScript partagés (Database, AppSupabaseClient)
```

## Architecture & sécurité

- **Auth** : Supabase SSR (`@supabase/ssr` 0.10) avec cookies `httpOnly`, `secure` en prod, `sameSite=lax`. Pas de partage cross-subdomain.
- **Sessions** : middleware Astro vérifie le JWT via `supabase.auth.getUser()` (round-trip serveur, signature vérifiée) puis invalide les sessions expirées via `last_logout_at` dans `profiles`.
- **RLS** : toutes les tables Supabase ont des Row-Level Security policies. Le service role est réservé aux écritures inter-utilisateurs (audit, export).
- **CSP** : nonce par requête généré dans `src/middleware.ts` et injecté dans tous les `<script>` inline.
- **Rate-limit** : en mémoire (limite par IP + route). Pour la production à fort trafic, migrer vers Upstash Redis ou Vercel KV.

## Déploiement

Déployé sur **Vercel** via le preset Astro (`@astrojs/vercel`).

1. Connecter le repo GitHub à Vercel.
2. Configurer toutes les variables `.env` dans **Project Settings → Environment Variables**.
3. Ajouter `CRON_SECRET` dans la config cron Vercel → trigger `/api/appointments/cron/expire`.
4. Push sur `main` → déploiement auto en production.
5. Les pull requests génèrent des preview URLs automatiquement.

Pour le déploiement manuel : `npx vercel --prod` (après `npm i -g vercel`).

## Audit qualité

Un audit complet (`AUDIT.md` à la racine) documente l'état du projet (score 6.9/10 au 22 juin 2026), les risques, et les quick wins. La dette de typage TypeScript est suivie par `npm run check` (cible 0 erreur).