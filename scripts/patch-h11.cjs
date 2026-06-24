const fs = require('fs');
const p = 'src/pages/dashboard/benevole/index.astro';
let s = fs.readFileSync(p, 'utf8');
const old = "const _taskStatusLabel: Record<string, string> = {\r\n  todo: 'Ã€ faire', in_progress: 'En cours', review: 'RÃ©vision', done: 'TerminÃ©',\r\n};\r\n";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join('');
fs.writeFileSync(p, s, 'utf8');
console.log('OK h11');
