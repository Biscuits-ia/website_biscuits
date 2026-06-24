const fs = require('fs');
const path = 'src/pages/api/formations/helloasso/webhook.ts';
let s = fs.readFileSync(path, 'utf8');

const old = `    currency:        payload?.data?.currency ?? 'EUR',`;
const NL = '\r\n';
const newB =
  '    currency:        (() => {' + NL +
  '      const raw = payload?.data?.currency ?? payload?.currency;' + NL +
  '      return raw === ' + String.fromCharCode(34) + 'EUR' + String.fromCharCode(34) + ' || raw === ' + String.fromCharCode(34) + 'USD' + String.fromCharCode(34) + ' || raw === ' + String.fromCharCode(34) + 'GBP' + String.fromCharCode(34) + ' ? raw : ' + String.fromCharCode(34) + 'EUR' + String.fromCharCode(34) + ';' + NL +
  '    })(),';

if (!s.includes(old)) { console.error('NOT FOUND 2.3'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.3 currency whitelist applied');
