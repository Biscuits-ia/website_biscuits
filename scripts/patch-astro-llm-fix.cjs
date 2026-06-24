const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');
// Fix typo "n" at end of "],n" - should be "],"
s = s.split('            ],n' + String.fromCharCode(10) + "          allow: '/'").join("            ]," + String.fromCharCode(10) + "          allow: '/'");
fs.writeFileSync(path, s, 'utf8');
console.log('OK fix typo');
