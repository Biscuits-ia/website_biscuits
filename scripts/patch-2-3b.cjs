const fs = require('fs');
const path = 'src/pages/api/formations/helloasso/webhook.ts';
let s = fs.readFileSync(path, 'utf8');

const old = '          currency:             payload?.data?.currency ?? ' + String.fromCharCode(39) + 'EUR' + String.fromCharCode(39) + ',';
const NL = '\r\n';
const newB =
  '          currency:             (() => {' + NL +
  '            const raw = payload?.data?.currency ?? payload?.currency;' + NL +
  '            return raw === ' + String.fromCharCode(34) + 'EUR' + String.fromCharCode(34) + ' || raw === ' + String.fromCharCode(34) + 'USD' + String.fromCharCode(34) + ' || raw === ' + String.fromCharCode(34) + 'GBP' + String.fromCharCode(34) + ' ? raw : ' + String.fromCharCode(34) + 'EUR' + String.fromCharCode(34) + ';' + NL +
  '          })(),';

if (!s.includes(old)) { console.error('NOT FOUND 2.3b'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.3b refund currency applied');
