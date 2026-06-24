const fs = require('fs');
const NL = '\n';

// Fix ctx.supabase on benevole/tasks.ts: add supabase to AuthContext

const path = 'src/pages/api/benevole/tasks.ts';
let s = fs.readFileSync(path, 'utf8');

const old = '  const adminSupabase = createSupabaseAdminClient();' + NL + '  return { adminSupabase, user, role };';
const newB = '  const adminSupabase = createSupabaseAdminClient();' + NL + '  return { adminSupabase, supabase, user, role };';

if (!s.includes(old)) { console.error('NOT FOUND p2-4'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-4');
