const fs = require('fs');
const p1 = 'src/pages/api/groupes/index.ts';
let s1 = fs.readFileSync(p1, 'utf8');
// File has CRLF line endings but my literal has LF. Read raw bytes to see actual content.
const old1 = "  const { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx } = flat;\n  if (rateLimitResponse) return rateLimitResponse;";
const newB1 = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx, rateLimitResponse } = flat;\n  if (rateLimitResponse) return rateLimitResponse;";
const c1 = s1.split(old1).length - 1;
console.log('LF matches:', c1);
s1 = s1.split(old1).join(newB1);
fs.writeFileSync(p1, s1, 'utf8');
console.log('OK h10c');
