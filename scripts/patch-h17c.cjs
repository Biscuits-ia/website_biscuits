const fs = require('fs');
const p = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(p, 'utf8');
// POST handler uses CRLF
const old = "  const { rateLimitResponse } = flat;\r\n  if (!flat.ok) return jsonError('Non autorise.', flat.status);\r\n  const { ctx } = flat;";
const newB = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\r\n  if (flat.rateLimitResponse) return flat.rateLimitResponse;\r\n  const { ctx } = flat;";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(p, s, 'utf8');
console.log('OK h17c POST');
