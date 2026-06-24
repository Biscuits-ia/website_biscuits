const fs = require('fs');
const NL = '\n';

// groupes/index.ts: still the old pattern. We need to fix the actual source - my p2-5h patch
// failed because the destructure pattern was wrong. Re-do it.
const p1 = 'src/pages/api/groupes/index.ts';
let s1 = fs.readFileSync(p1, 'utf8');

// Replace both handlers' destructure pattern to combine
const oldGET = '  const { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError(' + "'" + 'Non autorise.' + "'" + ', flat.status);\n  const { ctx } = flat;\n  if (rateLimitResponse) return rateLimitResponse;';
const newGET = '  if (!flat.ok) return jsonError(' + "'" + 'Non autorise.' + "'" + ', flat.status);\n  const { ctx, rateLimitResponse } = flat;\n  if (rateLimitResponse) return rateLimitResponse;';
s1 = s1.split(oldGET).join(newGET);
fs.writeFileSync(p1, s1, 'utf8');
console.log('OK h10 groupes GET');

// benevole/index: taskStatusLabel still present
const p2 = 'src/pages/dashboard/benevole/index.astro';
let s2 = fs.readFileSync(p2, 'utf8');
const oldT = "const _taskStatusLabel: Record<string, string> = {\n  todo: 'Ã€ faire', in_progress: 'En cours', review: 'RÃ©vision', done: 'TerminÃ©',\n};\n";
s2 = s2.split(oldT).join('');
fs.writeFileSync(p2, s2, 'utf8');
console.log('OK h10 benevole/index');
