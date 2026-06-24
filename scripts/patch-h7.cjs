const fs = require('fs');
const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');
// status unused in updateColCounts
const old = "      const status = col.getAttribute('data-status');";
const newB = "      const _status = col.getAttribute('data-status');";
if (!s.includes(old)) { console.error('NOT FOUND h7'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK h7');
