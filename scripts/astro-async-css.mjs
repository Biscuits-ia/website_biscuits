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
// as=style> + swap vers rel=stylesheet, avec repli <noscript> pour les
// navigateurs sans JS. Le petit bloc criticalCSS deja inline dans
// Layout.astro (reset, skip-link, police de base) couvre l'affichage minimal
// pendant ce chargement -> pas de flash de contenu non stylise perceptible.
//
// IMPORTANT : le swap ne peut PAS passer par un attribut onload="..." sur le
// <link> -- le CSP de vercel.json pose `script-src-attr 'none'`, qui bloque
// TOUT gestionnaire d'evenement inline en attribut HTML (onload, onclick...).
// Avec onload="", le lien reste bloque en rel="preload" pour toujours : la
// CSS ne s'applique jamais -> site sans aucun style en production (le CSP
// n'est pas envoye par le serveur statique local utilise pour la verif,
// d'ou l'ecart entre "ca marche en local" et "casse sur Vercel").
// A la place : un <script> inline colle apres chaque <link> fait le swap via
// JS (addEventListener), ce que `script-src-elem 'unsafe-inline'` autorise.
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

// Script de swap : un <script> minuscule colle immediatement APRES chaque
// <link data-async-css>, qui attache son listener 'load' sur
// document.currentScript.previousElementSibling.
//
// Pourquoi pas un unique script partage en fin de page (version precedente) :
// le <link rel=preload> est dans <head>, le script partage etait injecte
// juste avant </body> -- sur un CSS deja en cache HTTP (visite repetee), le
// navigateur peut declencher l'evenement 'load' du <link> PENDANT le parsing
// du <body>, largement avant que le parser atteigne le script en fin de
// page. L'ecouteur, attache trop tard, rate l'evenement. Le filet de
// securite `link.sheet || link.readyState==='complete'` ne rattrape rien :
// `.sheet` reste null pour un <link rel=preload> (ce n'est pas une feuille
// de style tant que rel!=stylesheet) et `readyState` est une API IE morte,
// absente de tout navigateur moderne. D'ou le CSS manquant ~1 fois sur 2,
// correle au cache et a la vitesse de parsing, pas a un bug deterministe.
//
// Fix : le script s'execute en synchrone juste apres la creation du <link>
// dans le DOM (pendant le parsing HTML), donc avant que le fetch de la
// ressource ait pu se terminer et declencher 'load' -- plus de course.
function swapScriptFor(href) {
  return (
    '<script>(function(){var l=document.currentScript.previousElementSibling;' +
    "l.addEventListener('load',function(){l.rel='stylesheet'});" +
    "if(l.sheet){l.rel='stylesheet'}" +
    `})();</script><noscript><link rel="stylesheet" href="${href}"></noscript>`
  );
}

function toAsyncCss(html) {
  return html.replace(/<link\s+[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
    const hrefMatch = tag.match(/href="([^"]+)"/);
    if (!hrefMatch) return tag;
    const href = hrefMatch[1];
    return (
      `<link rel="preload" as="style" href="${href}" data-async-css>` + swapScriptFor(href)
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
