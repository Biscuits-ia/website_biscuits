# Biscuits IA â€” Site officiel

Site de l'association **Biscuits IA** ([biscuits-ia.com](https://biscuits-ia.com)) â€” une association Loi 1901 d'intÃ©rÃªt gÃ©nÃ©ral qui rend l'IA accessible aux associations, collectivitÃ©s et petites structures, sans jargon et sans but lucratif.

Stack : **Astro 6** (SSR + Vercel adapter), **React 19** (composants interactifs), **Supabase** (auth + Postgres + RLS), **Tailwind 4**, **MDX** (blog & ressources).

---

## PrÃ©requis

- **Node â‰¥ 20.3** (cf. `package.json` â†’ `engines`)
- npm â‰¥ 10 (ou pnpm / yarn)
- Un projet [Supabase](https://supabase.com) avec les migrations du dossier `supabase/` appliquÃ©es

## Installation

```sh
# 1. Installer les dÃ©pendances
npm install

# 2. Copier le template d'env et le remplir
cp .env.example .env

# 3. Lancer le serveur de dev (http://localhost:4321)
npm run dev
```

## Variables d'environnement

Toutes les variables sont documentÃ©es dans `.env.example`. RÃ©capitulatif :

| Variable | Usage | Source |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | Supabase â†’ Settings â†’ API |
| `SUPABASE_ANON_KEY` | ClÃ© publique anon (client + middleware) | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | ClÃ© admin (bypass RLS, **server-only**) | idem |
| `SITE_URL` | URL canonique du site (SEO) | `https://biscuits-ia.com` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Email transactionnel (SMTP OVH) | Manager OVH â†’ Emails |
| `SMTP_FROM` / `SMTP_REPLY_TO` | Adresses From / Reply-To (optionnel) | idem |
| `CRON_SECRET` | Auth des cron jobs Vercel | `openssl rand -hex 32` |

## Scripts

```sh
npm run dev          # Serveur de dev (HMR)
npm run build        # Build prod â†’ dist/
npm run preview      # Preview du build local
npm run check        # Type-check (astro check) â€” cible 0 erreur
npm run lint         # ESLint (src/**/*.{ts,tsx,astro})
npm run lint:fix     # ESLint --fix
npm run format       # Prettier --write
npm run format:check # Prettier --check (CI)
```

## Structure du projet

```
src/
â”œâ”€â”€ components/       # Composants Astro statiques + sous-dossier react/ (client islands)
â”œâ”€â”€ content/          # Content Collections (blog, ressources)
â”œâ”€â”€ layouts/          # Layouts Astro (Layout, AuthLayout, BlogLayout, DashboardLayout)
â”œâ”€â”€ lib/              # Logique partagÃ©e (auth, supabase, validation, rateLimit)
â”œâ”€â”€ pages/            # Routes : pages Astro + endpoints API
â”‚   â”œâ”€â”€ api/          # 62 routes API sous /api/*
â”‚   â”œâ”€â”€ auth/         # Pages d'authentification
â”‚   â”œâ”€â”€ blog/         # Blog (Content Collections + SSR)
â”‚   â””â”€â”€ dashboard/    # Back-office (admin, modo, bÃ©nÃ©vole, association, data, user)
â”œâ”€â”€ styles/           # CSS global + Tailwind 4
â””â”€â”€ types/            # Types TypeScript partagÃ©s (Database, AppSupabaseClient)
```

## Architecture & sÃ©curitÃ©

- **Auth** : Supabase SSR (`@supabase/ssr` 0.10) avec cookies `httpOnly`, `secure` en prod, `sameSite=lax`. Pas de partage cross-subdomain.
- **Sessions** : middleware Astro vÃ©rifie le JWT via `supabase.auth.getUser()` (round-trip serveur, signature vÃ©rifiÃ©e) puis invalide les sessions expirÃ©es via `last_logout_at` dans `profiles`.
- **RLS** : toutes les tables Supabase ont des Row-Level Security policies. Le service role est rÃ©servÃ© aux Ã©critures inter-utilisateurs (audit, export).
- **CSP** : nonce par requÃªte gÃ©nÃ©rÃ© dans `src/middleware.ts` et injectÃ© dans tous les `<script>` inline.
- **Rate-limit** : en mémoire (limite par IP + route), complétable par le Firewall Vercel pour une protection distribuée.

## DÃ©ploiement

DÃ©ployÃ© sur **Vercel** via le preset Astro (`@astrojs/vercel`).

1. Connecter le repo GitHub Ã  Vercel.
2. Configurer toutes les variables `.env` dans **Project Settings â†’ Environment Variables**.
3. Worker email : periodicite geree cote Supabase via pg_cron (cf. docs/pg_cron_email_worker.md). Compatible plan Vercel Hobby.
4. Push sur `main` â†’ dÃ©ploiement auto en production.
5. Les pull requests gÃ©nÃ¨rent des preview URLs automatiquement.

Pour le dÃ©ploiement manuel : `npx vercel --prod` (aprÃ¨s `npm i -g vercel`).

## Audit qualitÃ©

Un audit complet (`AUDIT.md` Ã  la racine) documente l'Ã©tat du projet (score 6.9/10 au 22 juin 2026), les risques, et les quick wins. La dette de typage TypeScript est suivie par `npm run check` (cible 0 erreur).
