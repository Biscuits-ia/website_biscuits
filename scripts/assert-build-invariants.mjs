// scripts/assert-build-invariants.mjs
//
// Assertions sur l'ARTEFACT PRODUIT (dist/client/), pas sur le code source.
//
// Raison d'etre : ce projet a accumule des regressions ou l'intention etait
// correcte dans src/ mais annulee au build --
//   * public/robots.txt ecrasait silencieusement astro-robots-txt ;
//   * une policy `userAgent: [...]` faisait skipper l'integration sans erreur ;
//   * le nonce CSP etait fige au build dans les pages prerendered.
// Aucune de ces regressions n'est visible en relisant src/. Seul dist/ les revele.
//
//     node scripts/assert-build-invariants.mjs
//
// A lancer APRES `astro build`, en CI, sur chaque PR.

import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist/client';
let failures = 0;

/** @param {string} label @param {() => boolean | string} fn */
function assert(label, fn) {
  let ok, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (typeof r === 'string') detail = r;
  } catch (err) {
    ok = false;
    detail = err instanceof Error ? err.message : String(err);
  }
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`      -> ${detail}`);
}

const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(DIST, p));

// ── robots.txt ───────────────────────────────────────────────────────────────
assert('robots.txt existe (astro-robots-txt n a pas ete "Skipped")', () => exists('robots.txt') || 'dist/client/robots.txt absent');
assert('robots.txt interdit /dashboard', () => read('robots.txt').includes('Disallow: /dashboard'));
assert('robots.txt interdit /api', () => read('robots.txt').includes('Disallow: /api'));
assert('robots.txt declare une policy GPTBot', () => read('robots.txt').includes('User-agent: GPTBot'));
assert('robots.txt pointe sur sitemap-index.xml', () => read('robots.txt').includes('sitemap-index.xml'));
assert('robots.txt reference llms.txt', () => read('robots.txt').includes('llms.txt'));

// ── sitemap ──────────────────────────────────────────────────────────────────
assert('aucun sitemap.xml statique ne masque sitemap-index.xml', () => !exists('sitemap.xml') || 'public/sitemap.xml est revenu');
assert('sitemap-index.xml genere', () => exists('sitemap-index.xml'));

// Item P1-6 : trancher /logiciels et /anti-pepins.
// L'audit §4.4 signalait ces deux pages comme inatteignables (301 en amont
// qui masquaient le contenu). La decision prise est de les GARDER comme pages
// reelles et de laisser le sitemap les declarer. Cette assertion empeche toute
// regression silencieuse (ex: un redirect reintroduit dans vercel.json).
assert('/logiciels est dans le sitemap (page reelle, pas un 301)', () => {
  const xml = read('sitemap-0.xml');
  return xml.includes('/logiciels/') || '/logiciels absent du sitemap';
});
assert('/anti-pepins est dans le sitemap (page reelle, pas un 301)', () => {
  const xml = read('sitemap-0.xml');
  return xml.includes('/anti-pepins/') || '/anti-pepins absent du sitemap';
});

// ── CSP / nonce ──────────────────────────────────────────────────────────────
// Le middleware Astro s'execute AU BUILD pour les pages prerendered. Un nonce
// aleatoire s'y retrouverait donc fige, identique pour tous les visiteurs, a vie.
assert('aucun nonce fige dans le HTML prerendered', () => {
  const html = read('index.html');
  const m = html.match(/nonce="([A-Za-z0-9+/=_-]{16,})"/);
  return m ? `nonce statique trouve : ${m[1]}` : true;
});

// ── JSON-LD ──────────────────────────────────────────────────────────────────
// jsonLd() doit echapper < > & : aucun de ces caracteres ne doit subsister
// bruts dans un bloc ld+json, et le JSON doit rester parsable.
assert('tous les blocs JSON-LD sont echappes et valides', () => {
  const files = fs.readdirSync(DIST, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.html'))
    .map((f) => path.join(DIST, f));
  let blocks = 0;
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      blocks++;
      const body = m[1];
      if (/[<>]/.test(body)) return `${file}: "<" ou ">" brut dans un bloc ld+json`;
      try {
        JSON.parse(body);
      } catch {
        return `${file}: bloc ld+json non parsable`;
      }
    }
  }
  return blocks > 0 ? true : 'aucun bloc JSON-LD trouve (suspect)';
});

// ── Polices / RGPD ───────────────────────────────────────────────────────────
assert('aucune requete vers fonts.googleapis.com', () => {
  const html = read('index.html');
  return !html.includes('fonts.googleapis.com') || 'Google Fonts reintroduit dans le HTML';
});
assert('aucun @import Google Fonts dans le CSS bundle', () => {
  const dir = path.join(DIST, '_astro');
  const css = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
  const bad = css.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('fonts.googleapis.com'));
  return bad.length === 0 || `Google Fonts dans : ${bad.join(', ')}`;
});
assert('Inter est self-hostee (woff2 emis)', () => {
  const dir = path.join(DIST, '_astro');
  return fs.readdirSync(dir).some((f) => f.startsWith('inter-') && f.endsWith('.woff2'));
});

// ── Performance ──────────────────────────────────────────────────────────────
// inlineStylesheets:'always' inlinait ~94 Ko de CSS dans chaque page.
assert('le CSS inline de index.html reste sous 8 Ko', () => {
  const html = read('index.html');
  const bytes = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((a, m) => a + m[1].length, 0);
  return bytes < 8192 || `${bytes} octets de CSS inline`;
});

console.log(`\n${failures === 0 ? 'TOUTES LES ASSERTIONS PASSENT' : `${failures} ECHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
