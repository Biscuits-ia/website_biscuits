const fs = require('fs');
const p1 = 'src/pages/api/groupes/index.ts';
let s1 = fs.readFileSync(p1, 'utf8');
// The file uses LF for first 2 lines and CRLF after. Mixed endings.
// Manual bytes: "st { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx } = flat;\r\n"
const old = "  const { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx } = flat;\r\n";
const newB = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx, rateLimitResponse } = flat;\r\n";
const c = s1.split(old).length - 1;
console.log('matches:', c);
s1 = s1.split(old).join(newB);
fs.writeFileSync(p1, s1, 'utf8');
console.log('OK h10d');
