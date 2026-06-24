const fs = require('fs');
const p = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(p, 'utf8');
// Mixed line endings: after semicolon is LF, rest is CRLF
const old = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx, rateLimitResponse } = flat;\r\n  if (rateLimitResponse) return rateLimitResponse;";
const newB = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  if (flat.rateLimitResponse) return flat.rateLimitResponse;\r\n  const { ctx } = flat;";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(p, s, 'utf8');
console.log('OK h15c');
