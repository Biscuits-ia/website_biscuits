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
  let ok,
    detail = '';
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
assert(
  'robots.txt existe (astro-robots-txt n a pas ete "Skipped")',
  () => exists('robots.txt') || 'dist/client/robots.txt absent'
);
assert('robots.txt interdit /dashboard', () => read('robots.txt').includes('Disallow: /dashboard'));
assert('robots.txt interdit /api', () => read('robots.txt').includes('Disallow: /api'));
assert('robots.txt declare une policy GPTBot', () =>
  read('robots.txt').includes('User-agent: GPTBot')
);
assert('robots.txt pointe sur sitemap.xml', () => read('robots.txt').includes('/sitemap.xml'));
assert('robots.txt reference llms.txt', () => read('robots.txt').includes('llms.txt'));

// ── llms-full.txt (P4 #37) ───────────────────────────────────────────────────
// Doit etre PRERENDU. En SSR, chaque crawl reveillait une lambda et ouvrait une
// connexion Supabase en service_role pour un contenu statique par nature.
// `export const prerender = false` reintroduit ne se voit qu'ici : cote source,
// le fichier a exactement la meme tete.
assert(
  'llms-full.txt est prerendu (fichier statique, pas une lambda)',
  () => exists('llms-full.txt') || 'dist/client/llms-full.txt absent : prerender = false ?'
);

// Les deux assertions sur /trombinoscope (P4 #32 : page prerendue, sans nonce
// fige) sont retirees avec la page elle-meme.
//
// Attention : l'assertion generique « aucun nonce fige dans le HTML
// prerendered » plus bas ne lit que index.html. Elle ne remplace donc pas une
// verification par page. Si une future page prerendue doit etre couverte,
// c'est cette assertion generique qu'il faut elargir a tout dist/client/,
// plutot que d'ajouter un cas particulier de plus.

// ── sitemap ──────────────────────────────────────────────────────────────────
assert('sitemap.xml conventionnel genere', () => exists('sitemap.xml'));
assert('sitemap.xml reference le sitemap detaille', () =>
  read('sitemap.xml').includes('https://biscuits-ia.com/sitemap-0.xml')
);
assert('sitemap-index.xml genere', () => exists('sitemap-index.xml'));

// Les feuilles globales doivent participer au premier rendu. Les convertir en
// preload + swap JavaScript provoque un flash sans CSS, puis un déplacement de
// tout le viewport lorsque les styles arrivent (CLS mesuré jusqu'à 0,62).
assert('la CSS du premier rendu reste bloquante et stable', () => {
  const html = read('index.html');
  if (html.includes('data-async-css')) return 'swap CSS asynchrone détecté';
  return /<link[^>]+rel="stylesheet"/.test(html) || 'aucune feuille CSS bloquante trouvée';
});

// Un octet NUL dans un fichier texte peut etre tolere par le build tout en
// produisant un contenu corrompu pour les lecteurs, moteurs et extracteurs.
assert('aucun octet NUL dans les sources et artefacts texte', () => {
  const roots = ['src', 'public', 'scripts', DIST];
  const textExtensions = /\.(astro|css|html|js|json|jsx|md|mdx|mjs|ts|tsx|txt|xml|ya?ml)$/i;
  const offenders = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const rel of fs.readdirSync(root, { recursive: true })) {
      if (typeof rel !== 'string' || !textExtensions.test(rel)) continue;
      const file = path.join(root, rel);
      if (fs.statSync(file).isFile() && fs.readFileSync(file).includes(0)) {
        offenders.push(file);
      }
    }
  }

  return offenders.length === 0 || `octet(s) NUL trouve(s) dans : ${offenders.join(', ')}`;
});

// Item P1-6 : trancher /logiciels et /anti-pepins.
// L'audit §4.4 signalait ces deux pages comme inatteignables (301 en amont
// qui masquaient le contenu). La decision prise est de les GARDER comme pages
// reelles et de laisser le sitemap les declarer. Cette assertion empeche toute
// regression silencieuse (ex: un redirect reintroduit dans vercel.json).
assert('/logiciels est dans le sitemap (page reelle, pas un 301)', () => {
  const xml = read('sitemap-0.xml');
  return (
    xml.includes('<loc>https://biscuits-ia.com/logiciels</loc>') || '/logiciels absent du sitemap'
  );
});
assert('/anti-pepins est dans le sitemap (page reelle, pas un 301)', () => {
  const xml = read('sitemap-0.xml');
  return (
    xml.includes('<loc>https://biscuits-ia.com/anti-pepins</loc>') ||
    '/anti-pepins absent du sitemap'
  );
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

  const files = fs
    .readdirSync(SSR_DIR, { recursive: true })
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
    const code = fs
      .readFileSync(file, 'utf8')
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
  return (
    offenders.length === 0 ||
    `${offenders.length} script(s) sans nonce :\n      -> ${[...new Set(offenders)].join('\n      -> ')}`
  );
});

// Corollaire architectural (P4 #44) : en Astro 7, `Astro.locals` n'est injecte
// que dans le frontmatter des PAGES et des LAYOUTS (le compilateur emet
// `const Astro = $$result.createAstro(...)` en tete de factory). Pour les
// COMPOSANTS enfants (src/components/), `Astro` n'est pas dans le scope du
// `createComponent(($$result, ...))`. Si un composant utilise
// `Astro.locals.nonce` dans son template, le chunk compile contient
// `addAttribute(Astro.locals...)` qui leve un ReferenceError au runtime.
//
// En relisant src/components/ui/Toast.astro on ne voit rien d'anormal. Le build
// passe. C'est seulement a la 1re requete sur /dashboard/user que la page
// renvoie 0 octet de HTML (Vercel 500, middleware logError + re-throw).
//
// On verifie donc que les chunks dont le source est sous src/components/ ne
// referencent JAMAIS `Astro.locals` -- l'equivalent compile de l'acces fautif.
assert('Astro.locals n est pas reference dans un composant (P4 #44)', () => {
  if (!fs.existsSync(SSR_DIR)) return `${SSR_DIR} absent : lancer 'astro build'`;

  const files = fs
    .readdirSync(SSR_DIR, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.mjs'))
    .map((f) => path.join(SSR_DIR, f))
    .filter((f) => !path.basename(f).startsWith('render_'));

  const offenders = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    // Un chunk peut embarquer plusieurs fichiers (un pour chaque composant /
    // page / module de données inline). Le compilateur delemite chacun par
    // `//#region <path>` / `//#endregion`. On parcourt les regions une a une
    // et on attribue chaque `Astro.locals` a la region qui le contient -- pas
    // seulement la premiere (qui est souvent un module TS sans danger).
    const regionRe = /\/\/#region\s+(\S+)/g;
    const regions = [];
    let m;
    while ((m = regionRe.exec(code)) !== null) {
      regions.push({ start: m.index, headerEnd: m.index + m[0].length, path: m[1] });
    }
    if (regions.length === 0) continue;
    // Ferme chaque region a la suivante (ou fin de fichier).
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const bodyEnd = i + 1 < regions.length ? regions[i + 1].start : code.length;
      const body = code.slice(region.headerEnd, bodyEnd);
      // On ne flague que les regions dont la source est sous src/components/.
      // Les pages (src/pages/) et les layouts (src/layouts/) ont leur propre
      // frontmatter qui definit `Astro` via `$$result.createAstro(...)`.
      const sourceRel = region.path.replace(/\\/g, '/');
      if (!sourceRel.includes('src/components/')) continue;
      // On retire les commentaires de la region pour eviter les faux positifs
      // (un exemple XSS dans un JSDoc qui parle de `Astro.locals` n'est pas
      // un acces reel au runtime).
      const bodyNoComments = body
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
      if (/\bAstro\.locals\b/.test(bodyNoComments)) {
        offenders.push(`${path.basename(file)} <- ${sourceRel}`);
      }
    }
  }
  return (
    offenders.length === 0 ||
    `${offenders.length} chunk(s) composent(s) reference(nt) Astro.locals :\n      -> ${offenders.join('\n      -> ')}`
  );
});

// Corollaire : tant que `security.csp` n'est pas active, Astro emet le bootstrap
// des islands en <script> inline SANS nonce. Toute directive client:* sur une
// page SSR est donc morte en production (elle marche en prerendu, ou le CSP de
// vercel.json tolere 'unsafe-inline'). Cette assertion recense les pages SSR
// qui montent un island, pour qu'aucune ne s'ajoute par inadvertance.
assert('aucun island client:* sur une page SSR', () => {
  const PAGES = 'src/pages';
  const known = new Set([
    // Aucune page SSR ne monte d'island client:* depuis le remplacement du
    // calendrier admin React par un composant serveur Astro + JS vanilla inline.
  ]);

  const pages = fs
    .readdirSync(PAGES, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.astro'));

  const found = [];
  for (const rel of pages) {
    const src = fs.readFileSync(path.join(PAGES, rel), 'utf8');
    if (/export const prerender = true/.test(src)) continue;

    // Un island peut etre monte par un composant intermediaire : on suit les
    // composants importes depuis la page (1 niveau, suffisant ici).
    const bodies = [src];
    for (const m of src.matchAll(/from '(?:@\/|\.{1,2}\/)[^']*\/([A-Z][\w-]*)\.astro'/g)) {
      const hit = fs
        .readdirSync('src/components', { recursive: true })
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
// Les en-tetes IP de proxy generiques ne sont PAS ecrits par Vercel : un
// appelant peut les choisir librement. Seul `x-vercel-forwarded-for`
// (et `clientAddress` qui en derive) est ecrase par la plateforme.
//
// L'item P1 #3 a corrige `lib/http.ts`, mais deux routes lisaient encore ces
// headers en direct pour horodater l'acceptation des CGV : la preuve juridique
// enregistrait l'IP dictee par le client. Toute lecture directe est desormais
// interdite hors de `lib/http.ts`.
assert('aucune lecture directe d un header IP forgeable hors lib/http.ts', () => {
  const ROOT = 'src';
  const FORGEABLE = /headers\.get\(\s*['"](cf-connecting-ip|x-real-ip|x-forwarded-for)['"]\s*\)/;

  const files = fs
    .readdirSync(ROOT, { recursive: true })
    .filter((f) => typeof f === 'string' && /\.(ts|astro)$/.test(f))
    .filter((f) => f.split(path.sep).join('/') !== 'lib/http.ts');

  const offenders = files.filter((rel) =>
    FORGEABLE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  );
  return (
    offenders.length === 0 ||
    `header IP forgeable lu dans : ${offenders.join(', ')} -- utiliser getClientIp()`
  );
});

// ── JSON-LD ──────────────────────────────────────────────────────────────────
// jsonLd() doit echapper < > & : aucun de ces caracteres ne doit subsister
// bruts dans un bloc ld+json, et le JSON doit rester parsable.
assert('tous les blocs JSON-LD sont echappes et valides', () => {
  const files = fs
    .readdirSync(DIST, { recursive: true })
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
  const bad = css.filter((f) =>
    fs.readFileSync(path.join(dir, f), 'utf8').includes('fonts.googleapis.com')
  );
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
  const bytes = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce(
    (a, m) => a + m[1].length,
    0
  );
  return bytes < 8192 || `${bytes} octets de CSS inline`;
});

// ── a11y (P2 #38) ─────────────────────────────────────────────────────────────
// L'audit de contraste axe-core ne peut pas tourner dans ce script (il faut
// un navigateur). Mais on verifie que le spec qui le porte N'EST PAS
// supprimé par inadvertance : retirer le fichier, c'est supprimer l'a11y
// silencieusement, exactement le pattern que ce script combat.
assert(
  'spec a11y-contrast (axe-core) present',
  () =>
    fs.existsSync('tests/e2e/a11y-contrast.spec.ts') ||
    'tests/e2e/a11y-contrast.spec.ts absent : audit P2 #38 supprime ?'
);
assert('dep @axe-core/playwright declaree', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return (
    Boolean(pkg.devDependencies?.['@axe-core/playwright']) ||
    '@axe-core/playwright absent de devDependencies'
  );
});

// ── secrets scan (P2 #39) ─────────────────────────────────────────────────────
// Meme logique : on ne peut pas executer gitleaks ici (binaire Go, pas
// module Node), mais on verifie la presence de la config et du job CI qui
// l'integre. Sans cette assertion, supprimer .gitleaks.toml ou le job
// secrets-scan retablirait la faille en silence.
assert(
  '.gitleaks.toml present',
  () => fs.existsSync('.gitleaks.toml') || '.gitleaks.toml absent : audit P2 #39 supprime ?'
);
assert('CI integre le scan secrets gitleaks', () => {
  if (!fs.existsSync('.github/workflows/ci.yml')) return 'ci.yml absent';
  const yml = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  return /gitleaks/i.test(yml) || 'job gitleaks absent de .github/workflows/ci.yml';
});
assert('CI integre le job a11y contrast', () => {
  if (!fs.existsSync('.github/workflows/ci.yml')) return 'ci.yml absent';
  const yml = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  return (
    (/a11y-contrast/.test(yml) && /axe-core/.test(yml)) ||
    'job a11y axe-core absent de .github/workflows/ci.yml'
  );
});

console.log(`\n${failures === 0 ? 'TOUTES LES ASSERTIONS PASSENT' : `${failures} ECHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
