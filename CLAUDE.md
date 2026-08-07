# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
FRENCH PROJET : parler toujours en français !
## Project

Public site + back-office for **Biscuits IA**, a French non-profit (Loi 1901) making AI
accessible to associations, local governments and small organizations. Astro 7, `output:
'server'` (SSR by default, individual pages opt into `prerender = true`), deployed on Vercel,
Supabase (Postgres + Auth + Storage) as backend. No online payment: paid registrations are
settled by bank transfer and validated manually by an admin (HelloAsso was removed 2026-07-09).

Five program areas: AI support/training, cyber-defense, software for non-profits, "Anti Pepins"
(public scam-victim help service), open research & models. The app has a volunteer space
(tasks/projects), an associations space, and an admin space — see `src/pages/dashboard/{admin,
association,benevole,user}`.

## Commands

```bash
npm run dev          # Astro dev server on :4321
npm run build        # Production build (type-checks + emits .vercel/output)
npm run preview      # Serve the production build locally
npm run check        # astro check (types + basic a11y)
npm run lint         # ESLint 10 flat config (eslint.config.js, no .eslintrc)
npm run lint:fix
npm run format        # Prettier --write src/**/*.{ts,tsx,astro,css,json}
npm run format:check
npm run test:e2e      # Playwright
npm run test:e2e:headed
```

There is no unit test suite (no Vitest/Jest). Verification = `npm run build` (catches type
errors) + Playwright e2e for critical flows + manual smoke tests.

To run a single Playwright spec: `npx playwright test tests/<file>.spec.ts`.

## Architecture

- `src/pages/` — file-based routing. Pages default to **SSR**; add `export const prerender =
  true` to opt a page into static generation (blog, marketing pages). `src/pages/api/*` are
  server endpoints (`export const POST/GET: APIRoute = ...`).
- `src/middleware.ts` — runs per-request for SSR pages only. Generates the CSP nonce (stored in
  `Astro.locals.nonce`) and injects dynamic security headers. **Does not run for prerendered
  pages** (it executes once at build time for those) — their CSP comes from the static headers
  in `vercel.json` instead.
- `src/lib/auth.ts` — centralized auth guards: `requireAuth`, `requireRole`, `requireAdmin`,
  `requireModerator`, `requireBenevole`, `requireAssociation` (return `{ user, session, supabase,
  role }` or an `AuthRedirect`, a branded `Response` subtype — TypeScript blocks access to
  `AuthResult` fields until the caller does `if (result instanceof Response) return result;`).
  JSON variants (`requireAuthJson`, `requireAdminJson`, `requireBenevoleJson`) return
  401/403 `Response` with `{ error }` for `fetch()`-based API calls. Auth checks always use
  `supabase.auth.getUser()` (verified server round-trip), never `getSession()` (client-controlled
  cookie, forgeable).
- `src/lib/supabase.ts` — Supabase client factories (`createSupabaseClient`,
  `createSupabaseAdminClient` for service-role/bypass-RLS operations).
- `src/lib/rateLimit.ts` — in-memory rate limiting keyed by IP; IP is read **only** from
  `x-vercel-forwarded-for` (the only header Vercel itself guarantees; never trust
  client-supplied IP headers).
- `src/content/blog/` — MDX blog posts (Astro Content Collections). Blog routing lives in
  `src/pages/blog/` (`index.astro`, `[...slug].astro`, `tag/[tag].astro`, `tag/index.astro`), all
  `prerender = true`. `src/lib/blogClusters.ts` defines topic clusters (`BLOG_CLUSTERS`) used for
  the "Guides de référence" nav and internal linking between related articles.
- `src/components/react/` — client-side interactive islands (React 19). Other `src/components/`
  Astro components are static/server-rendered.
- Path alias `@/*` → `src/*` (see `tsconfig.json`). Prefer `@/...` imports; some historical files
  still use relative `../../../` imports.

## Security invariants

1. **`supabase.auth.getUser()` server-side only** for verifying access — never `getSession()`.
2. **Auth mutations are tightly scoped.** `signOut({ scope: 'local' })` only inside the
   dedicated POST route with strict origin verification. `updateUser()` only in sensitive routes
   with re-authentication. Never call `getSession()`, `refreshSession()`, or a global `signOut()`
   from a lambda/endpoint.
3. **CSP nonces come only from `Astro.locals.nonce`**, set once per request by the middleware.
   Every inline `<script>` needs `nonce={Astro.locals.nonce}`.
4. **Prerendered pages get their CSP from `vercel.json`** (static headers), not the middleware —
   don't change that CSP without checking every prerendered page.
5. **Rate-limit IP source is `x-vercel-forwarded-for` only.** Never trust client- or
   unconfigured-proxy-supplied IP headers.
6. Any future payment webhook must verify its signature (constant-time HMAC) before parsing
   anything.

## Known pitfalls

- **Tailwind v4 is imported once**, via `src/styles/global.css` → `src/styles/tailwind.css`.
  Don't re-import it in components — it duplicates styles.
- **`public/` silently overrides integration-generated files** of the same name (e.g. don't
  recreate `public/robots.txt` — `astro-robots-txt` generates it, and a static file in `public/`
  wins and breaks the generated policy silently).
- **`astro-robots-txt`'s `userAgent` must be a string**, not an array — an array fails schema
  validation and the integration silently skips generation ("Skipped!" in build logs, no error).
- **ESLint 10 flat config only** — config lives in `eslint.config.js`; a `.eslintrc.json` would
  be ignored.
- **`payment_method = 'helloasso'`** is a legacy, read-only value on registrations predating
  2026-07-09 (absent from `paymentMethodSchema`, no new writes). Don't rewrite it — it's
  accounting history.
- **French transactional email templates intentionally omit accents** (e.g. "Parrainage
  enregistre") for compatibility with old mail clients — don't "fix" the spelling.
- **`security.csp` (Astro's hash-based CSP) is intentionally disabled** — see the long comment
  in `astro.config.mjs` for why (500+ inline `style=""` attributes and inline `<style>` tags
  would break under a style-src hash) and the migration path before it can be turned on.

## Out of scope for agents

- Modifying existing Supabase migrations (`supabase/migrations/*.sql`) — create a new,
  timestamped migration instead and test it in preprod.
- Touching secrets or RLS policies without explicit validation.
- Reinstalling `lucide-astro` (removed for bundle size — icons are inline SVG or `astro-icon`).
- Recreating `src/pages/legal/confidentialite.astro` — that page was intentionally unpublished;
  its content now lives in `legal/index.astro`.
