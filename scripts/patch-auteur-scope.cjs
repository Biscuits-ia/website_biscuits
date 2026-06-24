const fs = require('fs');
const path = 'src/pages/auteur/[slug].astro';
let s = fs.readFileSync(path, 'utf8');
// The `getStaticPaths()` function references AUTHORS, but at runtime AUTHORS is hoisted only
// when declared at top-level. It IS top-level. The build error says AUTHORS is not defined in
// the prerender context. The issue is likely the `const AUTHORS: Record<string, Author> = {...}`
// syntax. In Astro\'s server build, top-level consts SHOULD be available.
// Let me wrap AUTHORS in a getter to be safe.
const old = "const AUTHORS: Record<string, Author> = {";
const newB = "function getAuthors(): Record<string, Author> { return {";
// Find matching closing brace
// We\'ll do a small regex approach
const startIdx = s.indexOf(old);
if (startIdx < 0) { console.error('NOT FOUND'); process.exit(1); }
// Find the matching closing }; (we need to find the line that ends the AUTHORS object)
const startBlock = startIdx;
const searchFrom = s.indexOf("};", startIdx);
console.log('AUTHORS starts at', startIdx, 'first }; at', searchFrom);

// Simpler approach: just convert const to a function returning the object
// Replace the `const AUTHORS: Record<string, Author> = {` with a function
// and the matching `};` with `}; }`

// Find the end of the AUTHORS block by counting braces
let depth = 0;
let endIdx = -1;
for (let i = startBlock; i < s.length; i++) {
  if (s[i] === '{') depth++;
  else if (s[i] === '}') {
    depth--;
    if (depth === 0) { endIdx = i; break; }
  }
}
console.log('endIdx:', endIdx);
if (endIdx < 0) { console.error('UNBALANCED'); process.exit(1); }

// Replace
s = s.slice(0, startBlock) + "function getAuthors(): Record<string, Author> { const _a: Record<string, Author> = " + s.slice(startBlock + old.length, endIdx) + "; return _a; }" + s.slice(endIdx + 2);
// Now update getStaticPaths
s = s.replace(
  "export function getStaticPaths() {\n  return Object.keys(AUTHORS).map((slug) => ({ params: { slug } }));\n}",
  "export function getStaticPaths() {\n  return Object.keys(getAuthors()).map((slug) => ({ params: { slug } }));\n}"
);
// And the lookup
s = s.replace("const author = AUTHORS[slug];", "const author = getAuthors()[slug];");

fs.writeFileSync(path, s, 'utf8');
console.log('OK auteur scope');
