const fs = require('fs');
const NL = '\n';

// Fix the 3 broken call-sites: groupes/index.ts (2 handlers), groupes/[id]/adherents.ts (1 handler)
// They destructure { ctx, rateLimitResponse } but the lib returns { result, rateLimitResponse }.
// Add a new public helper `getAdherentsAuthContextFlat()` that returns { ctx | status, rateLimitResponse }.

const path = 'src/lib/adherentsApi.ts';
let s = fs.readFileSync(path, 'utf8');

const old =
  'export async function getAdherentsAuthContext(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<{ result: AdherentAuthResult; rateLimitResponse: Response | null }> {' + NL +
  '  const sessionSupabase = createSupabaseClient({ request, cookies });';

const newB =
  '/**' + NL +
  ' * Variante flat : retourne { ctx, rateLimitResponse } ou { status, rateLimitResponse }.' + NL +
  ' * Evite aux call-sites de tester `result.ok` puis `result.ctx` (drill-down lourd).' + NL +
  ' */' + NL +
  'export type AdherentAuthFlat =' + NL +
  '  | { ctx: ApiAuthContext; rateLimitResponse: Response | null }' + NL +
  '  | { status: 401 | 403; rateLimitResponse: Response | null };' + NL +
  '' + NL +
  'export async function getAdherentsAuthContextFlat(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<AdherentAuthFlat> {' + NL +
  '  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientIp);' + NL +
  '  if (result.ok) return { ctx: result.ctx, rateLimitResponse };' + NL +
  '  return { status: result.status, rateLimitResponse };' + NL +
  '}' + NL +
  '' + NL +
  'export async function getAdherentsAuthContext(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<{ result: AdherentAuthResult; rateLimitResponse: Response | null }> {' + NL +
  '  const sessionSupabase = createSupabaseClient({ request, cookies });';

if (!s.includes(old)) { console.error('NOT FOUND p2-5d'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5d flat helper added');
