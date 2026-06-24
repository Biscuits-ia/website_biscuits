const fs = require('fs');
const path = 'src/pages/dashboard/admin/formations.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';
s = s.split('const _cgvVersion = compliance?.cgv_version ?? null;' + NL).join('');
s = s.split('const _cgvDateActivation = compliance?.cgv_date_activation ?? null;' + NL).join('');
s = s.split('const _prochainAudit = compliance?.prochain_audit ?? null;' + NL).join('');
s = s.split('const _mediateurNom = compliance?.mediateur_nom ?? null;' + NL).join('');
fs.writeFileSync(path, s, 'utf8');
console.log('OK formations');

// benevole/index
const p2 = 'src/pages/dashboard/benevole/index.astro';
let s2 = fs.readFileSync(p2, 'utf8');
s2 = s2.split("const _taskStatusLabel: Record<string, string> = {\r\n  todo: 'Ã€ faire', in_progress: 'En cours', review: 'RÃ©vision', done: 'TerminÃ©',\r\n};\r\n").join('');
fs.writeFileSync(p2, s2, 'utf8');
console.log('OK benevole/index');

// benevole/project status
const p3 = 'src/pages/dashboard/benevole/project/[id].astro';
let s3 = fs.readFileSync(p3, 'utf8');
s3 = s3.split("      const _status = col.getAttribute('data-status');\r\n").join('');
fs.writeFileSync(p3, s3, 'utf8');
console.log('OK benevole/project/[id]');
