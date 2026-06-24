const fs = require('fs');
const path = 'src/pages/dashboard/benevole/index.astro';
let s = fs.readFileSync(path, 'utf8');
const old = "const taskStatusLabel: Record<string, string> = {\n  todo: 'Ã€ faire', in_progress: 'En cours', review: 'RÃ©vision', done: 'TerminÃ©',\n};";
const newB = "const _taskStatusLabel: Record<string, string> = {\n  todo: 'Ã€ faire', in_progress: 'En cours', review: 'RÃ©vision', done: 'TerminÃ©',\n};";
if (!s.includes(old)) { console.error('NOT FOUND h6'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK h6');
