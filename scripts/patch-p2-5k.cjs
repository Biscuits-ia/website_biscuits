const fs = require('fs');
const path = 'src/pages/api/groupes/[id]/adherents.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';
s = s.split("  if (!ctx) return jsonError('Non autorise.', 401);" + NL).join('');
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5k dead check removed in groupes/[id]/adherents.ts');
