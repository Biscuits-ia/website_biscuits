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

// ── llms-full.txt (P4 #37) ───────────────────────────────────────────────────
// Doit etre PRERENDU. En SSR, chaque crawl reveillait une lambda et ouvrait une
// connexion Supabase en service_role pour un contenu statique par nature.
// `export const prerender = false` reintroduit ne se voit qu'ici : cote source,
// le fichier a exactement la meme tete.
assert('llms-full.txt est prerendu (fichier statique, pas une lambda)', () =>
  exists('llms-full.txt') || 'dist/client/llms-full.txt absent : prerender = false ?');

// ── trombinoscope (P4 #32) ───────────────────────────────────────────────────
// Page publique en lecture seule. En SSR, chaque visite = 1 lambda + 1 requete
// Supabase en service_role. Prerendue, elle ne doit contenir ni nonce (le CSP
// vient de vercel.json) ni trace de secret.
assert('trombinoscope est prerendu', () =>
  exists('trombinoscope/index.html') || 'dist/client/trombinoscope/index.html absent : prerender = false ?');
assert('trombinoscope ne contient aucun nonce fige', () => {
  const m = read('trombinoscope/index.html').match(/nonce="([A-Za-z0-9+/=_-]{16,})"/);
  return m ? `nonce statique trouve : ${m[1]}` : true;
});

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

// ── CSP / nonce : scripts inline des routes SSR ──────────────────────────────
// Le middleware sert `script-src 'self' 'nonce-...' 'strict-dynamic'` sur les
// routes SSR. Sous 'strict-dynamic', 'self' et 'unsafe-inline' sont IGNORES par
// le navigateur : un <script> inline sans nonce est purement bloque.
//
// Deux pieges, tous deux invisibles en relisant src/ :
//   * un script sans nonce fonctionne quand meme en `astro dev`, car le
//     middleware y ajoute 'unsafe-inline' ;
//   * `define:vars` fait PERDRE l'attribut nonce a la compilation, alors que
//     `nonce={...}` figure bien dans le source et que `astro check` passe.
//
// Le 2026-07-08, la suppression de injectNonce() (qui taguait aveuglement tous
// les <script> du HTML de sortie) a ainsi rendu muets : les 31 pages dashboard
// (Toast, ConfirmDialog), la page projet benevole, le bandeau cookies, GTM et
// deux formulaires formations. Aucun test ne l'avait vu.
const SSR_DIR = '.vercel/output/functions/_render.func/dist/server';

assert('aucun <script> inline sans nonce dans les chunks SSR', () => {
  if (!fs.existsSync(SSR_DIR)) return `${SSR_DIR} absent : lancer 'astro build'`;

  const files = fs.readdirSync(SSR_DIR, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.mjs'))
    .map((f) => path.join(SSR_DIR, f))
    // render_*.mjs est le RUNTIME d'Astro, pas notre code. Il contient les
    // gabarits d'hydratation des islands (<script> du custom element
    // astro-island), que le framework emet sans nonce. Ils ne sont rendus que
    // sur une page portant une directive client:*. Cf. l'assertion suivante.
    .filter((f) => !path.basename(f).startsWith('render_'));

  const offenders = [];
  for (const file of files) {
    // Les commentaires en debut de ligne (docs, exemple XSS de lib/jsonLd.ts)
    // contiennent des balises <script> qui ne sont jamais emises.
    const code = fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');

    for (const m of code.matchAll(/<script([^>]{0,160})/g)) {
      const attrs = m[1];
      // Guillemets echappes => la balise vit dans un littéral de chaine JS
      // (ex: le commentaire d'un fichier importe en `?raw`), elle n'est pas
      // emise dans le HTML. Une vraie balise, elle, est ecrite en clair dans
      // un template literal.
      if (attrs.includes('\\"')) continue;
      // Data-blocks (ld+json, json) : non executes, hors perimetre script-src.
      if (/type="application\//.test(attrs)) continue;
      if (/nonce/.test(attrs)) continue;
      offenders.push(`${path.basename(file)} : <script${attrs.slice(0, 40).replace(/\s+/g, ' ')}`);
    }
  }
  return offenders.length === 0
    || `${offenders.length} script(s) sans nonce :\n      -> ${[...new Set(offenders)].join('\n      -> ')}`;
});

// Corollaire : tant que `security.csp` n'est pas active, Astro emet le bootstrap
// des islands en <script> inline SANS nonce. Toute directive client:* sur une
// page SSR est donc morte en production (elle marche en prerendu, ou le CSP de
// vercel.json tolere 'unsafe-inline'). Cette assertion recense les pages SSR
// qui montent un island, pour qu'aucune ne s'ajoute par inadvertance.
assert('aucun island client:* sur une page SSR', () => {
  const PAGES = 'src/pages';
  const known = new Set([
    // Connu et accepte : le calendrier admin ne s'hydrate pas en prod.
    // Correctif = activer security.csp (cf. astro.config.mjs). Item d'audit dedie.
    'dashboard/admin/appointments.astro',
  ]);

  const pages = fs.readdirSync(PAGES, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.astro'));

  const found = [];
  for (const rel of pages) {
    const src = fs.readFileSync(path.join(PAGES, rel), 'utf8');
    if (/export const prerender = true/.test(src)) continue;

    // Un island peut etre monte par un composant intermediaire : on suit les
    // composants importes depuis la page (1 niveau, suffisant ici).
    const bodies = [src];
    for (const m of src.matchAll(/from '(?:@\/|\.{1,2}\/)[^']*\/([A-Z][\w-]*)\.astro'/g)) {
      const hit = fs.readdirSync('src/components', { recursive: true })
        .find((f) => typeof f === 'string' && path.basename(f) === `${m[1]}.astro`);
      if (hit) bodies.push(fs.readFileSync(path.join('src/components', hit), 'utf8'));
    }
    if (bodies.some((b) => /\sclient:(load|idle|visible|only|media)/.test(b))) {
      const key = rel.split(path.sep).join('/');
      if (!known.has(key)) found.push(key);
    }
  }
  return found.length === 0 || `island(s) non declare(s) sur page SSR : ${found.join(', ')}`;
});

// ── IP client : un seul point de verite ──────────────────────────────────────
// `cf-connecting-ip`, `x-real-ip` et `x-forwarded-for` ne sont PAS ecrits par
// Vercel : un appelant les choisit librement. Seul `x-vercel-forwarded-for`
// (et `clientAddress` qui en derive) est ecrase par la plateforme.
//
// L'item P1 #3 a corrige `lib/http.ts`, mais deux routes lisaient encore ces
// headers en direct pour horodater l'acceptation des CGV : la preuve juridique
// enregistrait l'IP dictee par le client. Toute lecture directe est desormais
// interdite hors de `lib/http.ts`.
assert('aucune lecture directe d un header IP forgeable hors lib/http.ts', () => {
  const ROOT = 'src';
  const FORGEABLE = /headers\.get\(\s*['"](cf-connecting-ip|x-real-ip|x-forwarded-for)['"]\s*\)/;

  const files = fs.readdirSync(ROOT, { recursive: true })
    .filter((f) => typeof f === 'string' && /\.(ts|astro)$/.test(f))
    .filter((f) => f.split(path.sep).join('/') !== 'lib/http.ts');

  const offenders = files.filter((rel) =>
    FORGEABLE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
  );
  return offenders.length === 0
    || `header IP forgeable lu dans : ${offenders.join(', ')} -- utiliser getClientIp()`;
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
