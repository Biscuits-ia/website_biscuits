# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server (hot‑reloading)
npm run dev

# Build the site for production
npm run build

# Preview the production build locally
npm run preview

# Run a quick build and asset compression (used for final deployment)
npm run optimize

# Compress static assets (used by the `optimize` script)
npm run compress

# Generate a build analysis report
npm run analyze

# Run a Lighthouse audit against the local dev server
npm run lighthouse
```

### Running a Single Test / Script
- There are currently no test suites configured. To execute a custom script (e.g., the newsletter sender) use the corresponding npm script:
```bash
npm run send-newsletter
```

## High‑Level Architecture Overview

- **Framework**: The project is built with **Astro 5**, leveraging its component‑centric model.
- **Source Layout (`src/` directory)**
  - `pages/` – Top‑level routes. Each `.astro` file corresponds to a URL path. Dynamic routes use the `[...slug].astro` convention.
  - `components/` – Reusable UI components, primarily written as `.astro` files. Some interactive parts are implemented with **Svelte** components (`*.svelte`).
  - `layouts/` – Layout wrappers such as `Layout.astro` and `BlogLayout.astro` that provide common page scaffolding.
  - `styles/` – Global CSS (`global.css`) and theme definitions (`theme.css`). TailwindCSS is configured via the Vite plugin.
  - `assets/` – Static assets (images, favicons) referenced directly in components or pages.
  - `content/` – Markdown/MDX content for the blog. The `src/content/config.ts` defines the collection schema.
  - `utils/` – Helper modules (`formValidation.ts`, `web3forms.ts`) used across components and pages.
  - `types/` – TypeScript declaration files (`cookies.ts`, `global.d.ts`).

- **Build Process**
  - `npm run build` triggers `astro build`, which compiles `.astro` and `.svelte` components, processes MDX, and outputs a static site in the `dist/` directory.
  - The `optimize` script runs a post‑build compression step (`scripts/compress-assets.js`) to shrink assets for production.

- **Configuration Files**
  - `astro.config.mjs` – Astro project configuration, including integrations (`@astrojs/mdx`, `@astrojs/svelte`, `@astrojs/vercel`).
  - `tsconfig.json` – TypeScript compiler options.
  - `.eslintrc.json` – ESLint configuration for linting JavaScript/TypeScript.
  - `package.json` – Scripts, dependencies, and devDependencies.

- **Key Runtime Concepts**
  - **Server‑Side Rendering (SSR)**: Enabled via `@astrojs/node` and Vercel adapters; pages can fetch data during build or at request time.
  - **Content Collections**: Blog posts are stored as MDX files under `src/content/blog/` and accessed via the collection API.
  - **Svelte Integration**: Interactive UI components (e.g., `CookieConsent.svelte`, `DevisForm.svelte`) are imported into Astro components.

## Helpful Tips for Future Claude Instances
- When modifying routing, adjust or add files under `src/pages/`. The file name determines the URL.
- To add a new UI piece, create a reusable component under `src/components/` (prefer `.astro` unless interactivity requires Svelte).
- For new data types, update the appropriate collection schema in `src/content/config.ts` and add TypeScript types in `src/types/`.
- Run `npm run lint` (if configured) before committing to ensure code quality; currently only ESLint is set up.
- Use the `scripts/` folder for custom Node scripts (e.g., `send-newsletter.ts`). Add npm script entries in `package.json` for easy execution.
