# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev       # Dev server at localhost:4321 (proxies /api to localhost:8000)
npm run build     # Production build to ./dist/
npm run preview   # Preview the production build locally
npx astro check  # TypeScript type checking
```

## Environment Variables

Copy `.env.example` to `.env` and set:

- `PUBLIC_BACKEND_URL` — Laravel backend URL (default: `http://localhost:8000`)

## Architecture

**Stack:** Astro 6 (static output) + Svelte 5 + Tailwind CSS 4 + TypeScript, deployed on Vercel.

**Path alias:** `@/` maps to `src/` (configured in `tsconfig.json`).

**Key architectural decisions:**

- `output: 'static'` in `astro.config.mjs` — fully static site; API calls go to an external Laravel backend via the `/api` proxy (dev only).
- All pages live in `src/pages/`. Dynamic blog routes use `src/pages/blog/[...slug].astro` pulling from the `blog` content collection (`src/content/blog/*.mdx`).
- `src/config.ts` — central site config (name, URL, nav links, social, footer). Update here to propagate across the site.
- `src/content.config.ts` — Zod schema for the blog collection (title, pubDate, description, author, thumbnail, tags, featured, draft).
- Layout: `src/layouts/Layout.astro` wraps all pages. Accepts `title`, `description`, `canonical`, `ogImage`, `ogType`, `noindex`, and `schema` props. Injects SEO, Schema.org, GTM (prod only, gated behind cookie consent), and critical CSS inline.
- SEO components: `src/components/SEO/SEOHead.astro` and `src/components/SEO/SchemaOrg.astro` — supports Organization, Service, FAQPage, Article, WebPage schema types.
- Cookie consent: `src/components/svelte/CookieConsent.svelte` — loads GTM conditionally via `localStorage['cookie-consent']`. GTM ID: `GTM-W2273TRX`.
- `vercel.json` sets security headers (CSP, HSTS, X-Frame-Options, etc.) for all routes.
- Icons via `astro-icon` with `@iconify-json/mdi` icon set.

**Blog posts** frontmatter fields: `title`, `pubDate`, `description`, `author`, `thumbnail`, `tags`, `featured`, `draft`.
