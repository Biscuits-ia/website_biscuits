const fs = require('fs');
const path = 'src/pages/api/adherents/export.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const old =
  '  const { data, error } = await ctx.adminSupabase' + NL +
  '    .from(\'adherents\')' + NL +
  '    .select(\'nom, prenom, email, telephone, adresse, date_adhesion, statut\')' + NL +
  '    .order(\'created_at\', { ascending: false });';

const newB =
  '  // FIX P1 2.6 : filtres from/to via query params (?from=YYYY-MM-DD&to=YYYY-MM-DD),' + NL +
  '  // meme pattern que formations/export-csv.ts. Limite dure 10 000 lignes.' + NL +
  '  const url = new URL(request.url);' + NL +
  '  const fromParam = url.searchParams.get(\'from\') ?? \'\';' + NL +
  '  const toParam   = url.searchParams.get(\'to\') ?? \'\';' + NL +
  '' + NL +
  '  let query = ctx.adminSupabase' + NL +
  '    .from(\'adherents\')' + NL +
  '    .select(\'nom, prenom, email, telephone, adresse, date_adhesion, statut\')' + NL +
  '    .order(\'created_at\', { ascending: false })' + NL +
  '    .limit(10_000);' + NL +
  '  if (fromParam) query = query.gte(\'date_adhesion\', fromParam);' + NL +
  '  if (toParam) {' + NL +
  '    const toDate = new Date(toParam);' + NL +
  '    toDate.setDate(toDate.getDate() + 1);' + NL +
  '    query = query.lt(\'date_adhesion\', toDate.toISOString().slice(0, 10));' + NL +
  '  }' + NL +
  '  const data = (await query).data;' + NL +
  '  const error = (await query).error;';

if (!s.includes(old)) { console.error('NOT FOUND 2.6'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.6');
