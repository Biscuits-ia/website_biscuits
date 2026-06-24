const fs = require('fs');
const path = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(path, 'utf8');
// Remove the intermediate destructure of rateLimitResponse, just use flat directly
const old = '  const { rateLimitResponse } = flat;\n  if (!flat.ok) return jsonError(' + "'" + 'Non autorise.' + "'" + ', flat.status);\n  const { ctx } = flat;\n  if (rateLimitResponse) return rateLimitResponse;';
const newB = '  if (!flat.ok) return jsonError(' + "'" + 'Non autorise.' + "'" + ', flat.status);\n  const { ctx, rateLimitResponse } = flat;\n  if (rateLimitResponse) return rateLimitResponse;';
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK h9c groupes');
