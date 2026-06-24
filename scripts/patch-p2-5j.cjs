const fs = require('fs');
const NL = '\r\n';
const path = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(path, 'utf8');

const old = '  if (!ctx) return jsonError(' + String.fromCharCode(39) + 'Non autorise.' + String.fromCharCode(39) + ', 401);' + NL;
const count = (s.match(/if \(!ctx\) return jsonError\('Non autorise\.\', 401\);\r\n/g) || []).length;
console.log('matches:', count);
s = s.split(old).join('');
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5j dead check removed (all occurrences)');
