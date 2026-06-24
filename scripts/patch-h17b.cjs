const fs = require('fs');
const p = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(p, 'utf8');
// POST has \n not \r\n in middle
const old = "  const { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx } = flat;";
const newB = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  if (flat.rateLimitResponse) return flat.rateLimitResponse;\n  const { ctx } = flat;";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(p, s, 'utf8');
console.log('OK h17b POST');
