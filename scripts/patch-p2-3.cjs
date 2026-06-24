const fs = require('fs');
const path = 'src/pages/api/cron/email-outbox.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const old = "  if (authHeader !== Bearer ) {";
const newB = "  if (authHeader !== `Bearer ${expectedSecret}`) {";

if (!s.includes(old)) { console.error('NOT FOUND p2-3'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-3 Bearer literal');
