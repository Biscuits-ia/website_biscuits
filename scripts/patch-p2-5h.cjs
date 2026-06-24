const fs = require('fs');
const path = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const oldPOST =
  'export const POST: APIRoute = async ({ request, cookies }) => {' + NL +
  '  const { ctx, rateLimitResponse } = await getAdherentsAuthContextFlat(request, cookies);' + NL +
  '  if (rateLimitResponse) return rateLimitResponse;';

const newPOST =
  'export const POST: APIRoute = async ({ request, cookies }) => {' + NL +
  '  const flat = await getAdherentsAuthContextFlat(request, cookies);' + NL +
  '  const { rateLimitResponse } = flat;' + NL +
  '  if (!flat.ok) return jsonError(' + String.fromCharCode(39) + 'Non autorise.' + String.fromCharCode(39) + ', flat.status);' + NL +
  '  const { ctx } = flat;';

if (!s.includes(oldPOST)) { console.error('NOT FOUND POST'); process.exit(1); }
s = s.replace(oldPOST, newPOST);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5h POST');
