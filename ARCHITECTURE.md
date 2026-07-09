# ARCHITECTURE.md — Vue d'ensemble technique

## Flux requête

```
Client (browser)
  │
  ▼
CDN Vercel (cache static + edge)
  │
  ▼
src/middleware.ts
  ├─ getClientIpOrNull (x-vercel-forwarded-for uniquement)
  ├─ rateLimit (Upstash Redis + in-memory L1, bypass dev)
  ├─ logout cache (Map bornée, 30s TTL, max 10k entrées)
  ├─ Sec-Fetch-Site guard (CSRF, vérifie same-origin pour POST)
  ├─ CSP nonce generation → Astro.locals.nonce
  └─ createSupabaseClient + inject dans Astro.locals.supabase
  │
  ▼
Page (SSR) ou APIRoute
  ├─ requireAuth/requireAdmin/... (src/lib/auth.ts)
  └─ Logique métier
  │
  ▼
Supabase (Postgres + Auth + Storage)
  │
  ▼
Response (HTML rendu Astro OU JSON)
  │
  ▼
Vercel Runtime Logs (logError/logWarn structurés en ndjson)
```

## Layouts

Tous les layouts héritent de `BaseHead` (via `<head>`) et s'enchaînent par composition.

| Layout | Rôle | Fichier |
|---|---|---|
| `Layout.astro` | Layout racine : `<html>`, `<head>`, `<body>`, Header, Footer, CookieConsent, SW, h1 global masqué | `src/layouts/Layout.astro` |
| `DashboardLayout.astro` | Wrapper pour `/dashboard/**` : sidebar + bandeau + `<slot>` | `src/layouts/DashboardLayout.astro` |
| `AdminLayout.astro` | Wrapper pour `/dashboard/admin/**` | `src/layouts/AdminLayout.astro` |
| `BlogLayout.astro` | Wrapper pour `/blog/*` (article + sidebar) | `src/layouts/BlogLayout.astro` |
| `AuthLayout.astro` | Layout centré pour `/connexion`, `/inscription`, etc. | `src/layouts/AuthLayout.astro` |

## Auth helpers — `src/lib/auth.ts`

```
fetchRoleSecure(userId)  →  UserRole | null
requireAuth(ctx)         →  AuthResult | Response (302 redirect)
requireRole(ctx, [...])  →  AuthResult | Response
requireAdmin(ctx)        →  AuthResult | Response
requireModerator(ctx)    →  AuthResult | Response
requireBenevole(ctx)     →  AuthResult | Response
requireAssociation(ctx)  →  AuthResult | Response
requireAuthJson(ctx)     →  AuthResult | Response (401/403 JSON)
requireAdminJson(ctx)    →  AuthResult | Response
requireBenevoleJson(ctx) →  AuthResult | Response
requireAppointmentOwner(supabase, apptId, userId, isAdmin)
                         →  { ok: true, appointment } | { ok: false, status: 404|403 }
```

Tous les helpers renvoient `AuthResult` (`{ user, session: null, supabase, role }`)
ou un `Response` à retourner tel quel depuis le handler. Pattern d'usage :

```ts
export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user, supabase, role } = auth;
  // ...
};
```

`session` est **toujours `null`** côté serveur : conforme à la règle d'or
(oracle `getUser()` only). Pour le client, on a `@supabase/supabase-js` via
le store Astro.

## Supabase — 2 clients

| Client | Création | Usage | Bypass RLS |
|---|---|---|---|
| **user-context** | `createSupabaseClient({ request, cookies })` | Pages + API standard | Non (lit/écrit ce que l'user a le droit) |
| **admin (service-role)** | `createSupabaseAdminClient()` | Webhooks, imports, admin only | Oui ⚠️ |

`createSupabaseClient` lit le cookie `sb-*-auth-token` (Supabase SSR cookie).
L'admin client lit `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement.

## Paiement des formations — flux

```
Inscription (POST /api/formations/inscrire)
  │
  ├─ 1. atomic_training_register(...)  -> status = 'pending_payment'
  ├─ 2. Email de confirmation + coordonnees bancaires (enqueueEmail)
  └─ 3. L'adherent effectue le virement

Validation (POST /api/admin/formations/validate-payment, admin)
  └─ UPDATE training_registrations SET status = 'confirmed'
```

Aucun prestataire de paiement en ligne n'est branche depuis le retrait de
HelloAsso (2026-07-09). Les dons, eux, restent collectes sur la page HelloAsso
de l'association, hors de ce site.

## Rate-limit — `src/lib/rateLimit.ts`

- **L1 (in-memory)** : Map bornée par instance, TTL 60s. Hit le premier.
- **L2 (Upstash Redis)** : compteur global partagé entre instances. Si L1
  miss ou instance fraîche, on consulte Redis.
- **Bypass dev** : `if (import.meta.env.DEV) return;` pour ne pas péter
  le dev local.
- **IP source** : `x-vercel-forwarded-for` **UNIQUEMENT**. Sur Vercel ce
  header est signé (Vercel injecte `x-vercel-ip` et `x-vercel-forwarded-for`).
  Pas de `cf-connecting-ip` (Cloudflare), pas de `x-forwarded-for` brut.

## Observability — `src/lib/observability.ts`

- Zéro SaaS tiers (Sentry, etc.) — c'est un choix RGPD / charte IA éthique.
- Logs ndjson sur `stdout` → capturés par Vercel Runtime Logs.
- API : `logError(err, ctx)`, `logWarn(msg, ctx)`, `logInfo(msg, ctx)`,
  `requestContext(req)` extrait `method` + `path` + `requestId` depuis les
  headers Vercel.

## CSS architecture

| Fichier | Contenu | Importé par |
|---|---|---|
| `src/styles/tailwind.css` | `@import "tailwindcss"` + config | `src/styles/global.css` |
| `src/styles/theme.css` | Variables CSS (couleurs, spacing, fonts) | `src/styles/global.css` |
| `src/styles/global.css` | Reset + classes utilitaires + `.visually-hidden` | `Layout.astro` |
| `src/styles/dashboard.css` | Styles spécifiques dashboard | `DashboardLayout.astro` |

Tailwind v4 via `@tailwindcss/vite` plugin (pas de PostCSS). Le `@import`
de `tailwind.css` est fait **une seule fois** dans `global.css` — ne pas
dupliquer.

## Structure des routes

```
src/pages/
├── index.astro                              # /
├── (marketing)/                             # routes publiques
│   ├── piliers/[slug].astro
│   ├── blog/[...slug].astro
│   └── ...
├── formations/
│   ├── index.astro                          # /formations
│   ├── [slug].astro                         # /formations/ia-101
│   ├── parrainer.astro                      # /formations/parrainer
│   └── inscrire/[sessionId].astro
├── api/
│   ├── formations/
│   │   ├── inscrire.ts
│   │   ├── sponsoriser.ts                   # parrains
│   │   └── ...
│   ├── admin/                               # role=admin (requireAdmin)
│   │   ├── appointments.ts
│   │   ├── formations/...
│   │   └── ...
│   ├── benevole/                            # role=benevole|moderator|admin
│   │   ├── projects.ts
│   │   ├── tasks.ts
│   │   └── ...
│   ├── account/                             # routes user authentifié
│   │   ├── change-password.ts
│   │   └── ...
│   └── legal/                               # routes public
│       └── accept.ts
├── dashboard/                               # espace user connecté
│   ├── user/                                # role ≥ user
│   ├── benevole/                            # role ≥ benevole
│   ├── association/                         # role ≥ association
│   └── admin/                               # role = admin
└── legal/                                   # pages public
    ├── index.astro
    ├── mentions-legales.astro
    └── ...
```

## Stockage & uploads

- **Avatars, logos** : Supabase Storage bucket `avatars` (public read,
  auth write via RLS).
- **Resources (PDF, ZIP)** : bucket `resources` (public read, admin write).
- **Pièces jointes projets** : bucket `project-attachments` (RLS par projet).

## Email — `src/lib/email-queue.ts`

- Queue interne (table `email_queue` en Supabase) — pas de service tiers.
- Worker cron pg_cron toutes les 2 min (voir `docs/pg_cron_email_worker.md`).
- Templates dans `src/lib/mail.ts` (`renderRegistrationConfirmation`,
  `renderSponsorshipConfirmation`, `renderAdminNotification`, etc.).
- Reply-To via `SMTP_REPLY_TO` env, From via `SMTP_FROM`.

## Paiement

| Provider | Usage | Endpoint |
|---|---|---|
| Virement (manual) | Parrainages mode `transfer` | `POST /api/formations/sponsoriser` (paiement manuel) |

Aucun prestataire de paiement en ligne n'est integre. Les inscriptions payantes
se reglent par virement, validees manuellement par un admin.
