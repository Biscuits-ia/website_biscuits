const fs = require('fs');
const path = 'src/pages/auteur/[slug].astro';
let s = fs.readFileSync(path, 'utf8');

// Issue: Astro hoists getStaticPaths() to the TOP of the module, before the const AUTHORS declaration.
// The compile output shows getStaticPaths() FIRST, then the AUTHORS const is declared inside the component body.
// To fix: declare AUTHORS at module scope BEFORE getStaticPaths.
// Looking at the compiled output, the consts are placed inside the component. The hoisted
// getStaticPaths() at module scope can\'t see them.
// Workaround: inline the data in getStaticPaths.

const old = 'export function getStaticPaths() {\n  return AUTHORS.map((a) => ({ params: { slug: a.slug } }));\n}';
const newB = 'export function getStaticPaths() {\n  return [\n    { params: { slug: "alexis-gallard" } },\n    { params: { slug: "biscuits-ia" } },\n  ];\n}';
s = s.replace(old, newB);

fs.writeFileSync(path, s, 'utf8');
console.log('OK static paths inlined');
