const fs = require('fs');
const p = 'src/pages/dashboard/benevole/index.astro';
let s = fs.readFileSync(p, 'utf8');
// file uses CRLF + actual UTF-8 chars
const old = "const _taskStatusLabel: Record<string, string> = {\r\n  todo: 'À faire', in_progress: 'En cours', review: 'Révision', done: 'Terminé',\r\n};\r\n";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join('');
fs.writeFileSync(p, s, 'utf8');
console.log('OK h14');
