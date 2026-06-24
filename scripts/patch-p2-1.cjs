const fs = require('fs');
const path = 'src/pages/legal/index.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const old = 'function formatDate(iso) {';
const newB = 'function formatDate(iso: string | null | undefined): string {';

if (!s.includes(old)) { console.error('NOT FOUND p2-1'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-1 formatDate type');
