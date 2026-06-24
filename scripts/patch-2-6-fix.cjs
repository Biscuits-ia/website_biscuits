const fs = require('fs');
const path = 'src/pages/api/adherents/export.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const old =
  '  const data = (await query).data;' + NL +
  '  const error = (await query).error;';

const newB = '  const { data, error } = await query;';

if (!s.includes(old)) { console.error('NOT FOUND 2.6-fix'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.6-fix single await');
