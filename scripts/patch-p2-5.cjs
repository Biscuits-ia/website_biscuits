const fs = require('fs');
const path = 'src/lib/adherentsApi.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

const old =
  'export async function getAdherentsAuthContext(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<{ result: AdherentAuthResult; rateLimitResponse: Response | null }> {';

const newB =
  '/**' + NL +
  ' * Wrapper pratique pour les call-sites.' + NL +
  ' * Retourne { ctx, rateLimitResponse } quand auth OK, sinon { status, rateLimitResponse }.' + NL +
  ' */' + NL +
  'export type AdherentAuthWrapper =' + NL +
  '  | { ctx: ApiAuthContext; rateLimitResponse: Response | null }' + NL +
  '  | { status: 401 | 403; rateLimitResponse: Response | null };' + NL +
  '' + NL +
  'export async function getAdherentsAuthContext(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<AdherentAuthWrapper> {' + NL +
  '  const { result, rateLimitResponse } = await getAdherentsAuthContextInternal(request, cookies, clientIp);' + NL +
  '  if (result.ok) return { ctx: result.ctx, rateLimitResponse };' + NL +
  '  return { status: result.status, rateLimitResponse };' + NL +
  '}' + NL +
  '' + NL +
  'async function getAdherentsAuthContextInternal(' + NL +
  '  request: Request,' + NL +
  '  cookies: any,' + NL +
  '  clientIp?: string,' + NL +
  '): Promise<{ result: AdherentAuthResult; rateLimitResponse: Response | null }> {';

if (!s.includes(old)) { console.error('NOT FOUND p2-5'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5');
