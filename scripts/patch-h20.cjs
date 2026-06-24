const fs = require('fs');
const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');
// The warning persists because define:vars injects memberOptionsJson as a const, but
// the line `const _memberOptions = JSON.parse(...)` shadows the const declaration. The
// warning is benign (Astro language tool). Easiest fix: explicitly declare memberOptionsJson
// in the script body so TS knows it.
// Actually the issue: <script is:inline define:vars> tells Astro to inject the consts at
// the top of the script, but the TS checker doesn'\'t see that. So we need to make the
// reference TS-friendly.
// Cleanest fix: add `/* eslint-disable */` or use `// @ts-ignore` directive on the line.
// Use `// @ts-expect-error` is wrong (we know it works). Use `// @ts-ignore` to silence.
const old = "  const _memberOptions = JSON.parse((typeof memberOptionsJson !== 'undefined') ? memberOptionsJson : '[]');";
const newB = "  // @ts-ignore - memberOptionsJson is injected by <script is:inline define:vars>\n  const _memberOptions = JSON.parse(memberOptionsJson);";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK h20');
