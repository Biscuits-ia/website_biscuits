// Integration Astro : charge les feuilles de style en asynchrone (non
// bloquant) sur les pages prerendered (dist/client/**/*.html).
//
// Astro genere un <link rel="stylesheet"> classique par CSS importe/inline
// via <style> non-inlinable (>4 Ko, cf. build.inlineStylesheets='auto' dans
// astro.config.mjs). Ce <link> bloque le premier rendu (Lighthouse "Eliminate
// render-blocking resources") : Layout.css a lui seul pese ~64 Ko sur les
// ~130 pages publiques.
//
// Technique standard (web.dev "Defer non-critical CSS") : <link rel=preload
// as=style> + swap vers rel=stylesheet au onload, avec repli <noscript> pour
// les navigateurs sans JS. Le petit bloc criticalCSS deja inline dans
// Layout.astro (reset, skip-link, police de base) couvre l'affichage minimal
// pendant ce chargement -> pas de flash de contenu non stylise perceptible.
//
// Ne touche que dist/client (sortie prerendered) : les routes SSR
// (`export const prerender = false`, ex. /legal/cgu, /legal/cgv, dashboard,
// tunnels d'inscription) generent leur HTML a la requete et ne passent pas
// par cette etape post-build. Elles restent en CSS bloquant classique --
// acceptable, ce sont des pages peu/pas indexees.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function walkHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function toAsyncCss(html) {
  return html.replace(/<link\s+[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
    const hrefMatch = tag.match(/href="([^"]+)"/);
    if (!hrefMatch) return tag;
    const href = hrefMatch[1];
    return (
      `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
      `<noscript><link rel="stylesheet" href="${href}"></noscript>`
    );
  });
}

export default function asyncCss() {
  return {
    name: 'async-css-swap',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const rootDir = fileURLToPath(dir);
        const htmlFiles = await walkHtmlFiles(rootDir);
        let changed = 0;
        for (const file of htmlFiles) {
          const html = await readFile(file, 'utf-8');
          const next = toAsyncCss(html);
          if (next !== html) {
            await writeFile(file, next, 'utf-8');
            changed++;
          }
        }
        logger.info(`async-css-swap: ${changed}/${htmlFiles.length} pages HTML converties en CSS non-bloquant`);
      },
    },
  };
}
