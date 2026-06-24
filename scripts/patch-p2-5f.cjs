const fs = require('fs');
const path = 'src/lib/adherentsApi.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// We made the union but TS narrows the wrong side after `if (rateLimitResponse) return`
// because rateLimitResponse can be null in BOTH branches. Switch to a discriminated union
// keyed on `ok`.

const old =
  'export type AdherentAuthFlat =' + NL +
  '  | { ctx: ApiAuthContext; rateLimitResponse: Response | null }' + NL +
  '  | { status: 401 | 403; rateLimitResponse: Response | null };';

const newB =
  'export type AdherentAuthFlat =' + NL +
  '  | { ok: true; ctx: ApiAuthContext; rateLimitResponse: Response | null }' + NL +
  '  | { ok: false; status: 401 | 403; rateLimitResponse: Response | null };';

if (!s.includes(old)) { console.error('NOT FOUND p2-5f type'); process.exit(1); }
s = s.replace(old, newB);

const oldImpl =
  '  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientIp);' + NL +
  '  if (result.ok) return { ctx: result.ctx, rateLimitResponse };' + NL +
  '  return { status: result.status, rateLimitResponse };';

const newImpl =
  '  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientIp);' + NL +
  '  if (result.ok) return { ok: true, ctx: result.ctx, rateLimitResponse };' + NL +
  '  return { ok: false, status: result.status, rateLimitResponse };';

if (!s.includes(oldImpl)) { console.error('NOT FOUND p2-5f impl'); process.exit(1); }
s = s.replace(oldImpl, newImpl);

fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5f discriminated union');
