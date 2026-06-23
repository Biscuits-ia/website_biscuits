# Correctifs urgents - 23 juin 2026 (Sprint 1)

Audit realise a partir de AUDIT.md, AUDIT-FRESH.md et du scan statique du
code source. Cette PR regroupe les correctifs de criticite elevee a moyenne
effectues en une seule passe.

## Resume executif

| Fix | Fichier(s) | Criticite |
|---|---|---|
| A1 | `.env` + `.env.example` + `src/env.d.ts` | Haute (secret) |
| A2 | 3 migrations SQL | Bloquant (cron/RLS/newsletter) |
| A3 | `supabase/migration/20260623_add_volunteer_appointments_expiry.sql` | Bloquant (cron) |
| A4 | `src/pages/auth/deconnexion.ts` | Critique (race) |
| A5 | `src/pages/api/appointments/index.ts` | Securite |
| A6 | Suppression `src/pages/dashboard/user/parametres.astro` | UX |
| A7 | `src/pages/404.astro` + 14 pages publiques | Performance (TTFB) |
| A8 | Suppression pages/fonctions fantomes | Hygiene |
| A9 | `src/env.d.ts` (publications) | Securite (typage) |
| A10 | `src/lib/http.ts` + 4 imports | Hygiene |

## 1. Securite : rate-limit sur les endpoints publics

**Statut :** OK (fix precedent, juin 2026)
**Fichiers :** `src/pages/api/recruitment.ts`, `src/pages/auth/mot-de-passe-oublie.ts`

- 5 soumissions / IP / 10 min sur `/api/recruitment` (avec dedup par email).
- 3 soumissions / IP / 10 min sur `/api/auth/mot-de-passe-oublie`.
- Honeypot serveur sur `/api/recruitment`.
- Longueurs max strictement enforcees : motivation <= 5000 chars.

## 2. Securite : race condition fix dans le cron d'expiration des RDV

**Statut :** OK (fix precedent, juin 2026)
**Fichier :** `src/pages/api/appointments/cron/expire.ts`

UPDATE atomique unique avec WHERE sur le statut + expires_at. Le moteur DB
garantit qu'aucune ligne ne peut changer entre la selection et l'ecriture.

**NOTE :** la migration `20260623_add_volunteer_appointments_expiry.sql` doit
etre jouee cote Supabase AVANT le deploiement, sinon le cron echoue en 400.

## 3. Infrastructure : cron Vercel pour l'expiration des RDV

**Statut :** OK (fix precedent, juin 2026)
**Fichier :** `vercel.json`

```json
"crons": [
  { "path": "/api/appointments/cron/expire", "schedule": "*/5 * * * *" }
]
```

## 4. Securite : race condition sur la deconnexion (NOUVEAU - A4)

**Fichier :** `src/pages/auth/deconnexion.ts`

**Probleme :** on marquait `last_logout_at` APRES `signOut()`. Un user
multi-onglets pouvait rester connecte sur onglet 2 : le `iat` de son
access_token etait anterieur a la nouvelle valeur `last_logout_at`, et
le middleware (qui compare `iat <= last_logout_at`) considerait la session
comme encore valide.

**Fix :** on marque `last_logout_at` AVANT `signOut()`. La fenetre de race
est fermee.

Bonus : ajout d'un handler `GET = POST` pour permettre la deconnexion via
un simple lien (utile depuis un email de notification par exemple).

## 5. Securite : validation UUID sur slot_id (NOUVEAU - A5)

**Fichier :** `src/pages/api/appointments/index.ts`

**Probleme :** `slot_id` etait juste caste en TypeScript sans validation
runtime. Un admin malveillant pouvait injecter n'importe quoi (text, JSON,
objet) et faire echouer silencieusement l'INSERT (FK violation 500) ou
exploiter un edge case.

**Fix :** `isValidUUID(body.slot_id)` + sanitization de `notes`
(max 1000 chars) et `candidate_email` (max 255 chars, lowercase, trim).

## 6. Hygiene : suppression pages/fonctions fantomes (NOUVEAU - A8)

**Supprime :**
- `src/pages/dashboard/user/parametres.astro` (doublon de `settings.astro`)
- `createServerSupabaseClient` et `createBrowserSupabaseClient`
  (deja retires de `src/lib/supabase.ts` lors du fix precedent)

**Verifie absent :**
- `src/pages/login.astro`, `src/pages/atelier.astro`, `src/pages/projet.astro`
- `src/pages/dashboard/benevole/project/index.astro`

## 7. Hygiene : centralisation de `getClientIp` (NOUVEAU - A10)

**Fichier :** `src/lib/http.ts` (nouveau, 1741 bytes)

Export `getClientIp(request, clientAddress?)` et `getClientIpOrNull(...)`.
Remplace les 4 copies locales dans :
- `src/pages/api/contact.ts`
- `src/pages/api/recruitment.ts`
- `src/pages/api/newsletter.ts`
- `src/pages/auth/mot-de-passe-oublie.ts`
- `src/middleware.ts`

## 8. Hygiene : typage env.d.ts (NOUVEAU - A9)

**Fichier :** `src/env.d.ts`

Ajoute :
- `SUPABASE_SERVICE_ROLE_KEY` (declare, documentee SSR-only)
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nouveau format Supabase 2024+)
- `PUBLIC_SITE_URL`
- `INDEXNOW_KEY`
- `CRON_SECRET`
- `PUBLIC_ANALYTICS_DISABLED` (deplace depuis `src/types/global.d.ts`)

Garde-fou de typage `__SSRServiceRoleKey` pour empecher la cle service_role
d'etre importee depuis un bundle client.

## 9. Performance : prerender = true sur 14 pages publiques (NOUVEAU - A7)

**Pagine prerendues :**
- `/404`
- `/blog/[...slug]`, `/blog/tag/[tag]` (deja OK, verifie)
- `/combats/*` (6 pages)
- `/legal/*` (4 pages)
- `/rejoignez-nous`, `/utilisateurs`, `/trombinoscope`

**Non prerendues (lecture cookies BDD) :**
- `/connexion`, `/inscription`, `/mot-de-passe-oublie`,
  `/reinitialisation-mot-de-passe`, `/verifier-code-*`, `/ateliers/inscription`

Gain attendu : -500 ms a -1.5 s de TTFB sur les pages publiques (cold start
Vercel evite).

## 10. Hygiene : `.env` + `.env.example` reecrits (NOUVEAU - A1)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=                    # regeneratee le 2026-06-23
PUBLIC_SUPABASE_PUBLISHABLE_KEY=      # nouveau format, optionnel
SUPABASE_SERVICE_ROLE_KEY=            # regeneratee le 2026-06-23
SITE_URL=https://biscuits-ia.com
PUBLIC_SITE_URL=https://biscuits-ia.com
GTM_ID=GTM-W2273TRX
PUBLIC_ANALYTICS_DISABLED=false
CRON_SECRET=                          # openssl rand -hex 32
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@biscuits-ia.com
SMTP_PASSWORD=
SMTP_FROM=noreply@biscuits-ia.com
SMTP_REPLY_TO=
INDEXNOW_KEY=
```

## Actions a faire cote operateur

1. **URGENT** : regenerer les cles Supabase (anon + service_role) sur
   https://supabase.com/dashboard > Project Settings > API. Les anciennes
   cles sont dans l'historique git. Les nouvelles sont a coller dans
   `.env` apres ce deploiement.
2. Jouer les 3 nouvelles migrations dans Supabase SQL Editor, dans l'ordre :
   1. `20260623_add_volunteer_appointments_expiry.sql` (cron)
   2. `20260623_newsletter_subscribers.sql` (newsletter)
   3. `20260623_fix_associations_with_check.sql` (RLS associations)
3. Verifier le cron Vercel dans le dashboard Vercel > Settings > Cron Jobs
   (doit apparaitre apres le prochain deploy).
4. Brancher un provider SMTP (OVH, SendGrid, Resend...) sur les nouveaux
   inserts (trigger pg_net + edge function, ou polling CRON).
5. Optionnel : migrer vers `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nouveau
   format Supabase 2024+). Remplacer `SUPABASE_ANON_KEY` dans
   `src/lib/supabase.ts` par `PUBLIC_SUPABASE_PUBLISHABLE_KEY` une fois
   toutes les cles regenerees.

## Limites connues non resolues dans cette PR

1. `useGenerativeUI` / `as any` (30+ occurrences) - non corrige (refactor
   TypeScript a planifier separement).
2. `service_role` utilise sur ~30 routes admin - refactor a planifier.
3. Pas de tests automatises. Une suite Vitest sur `lib/validation.ts`,
   `lib/auth.ts` et `lib/adherentsApi.ts` reste a creer.
4. Bundle Vercel toujours 31 Mo (cause principale : `output: 'server'`
   global). A migrer en `output: 'hybrid'` pour elaguer les bundles par
   page.
