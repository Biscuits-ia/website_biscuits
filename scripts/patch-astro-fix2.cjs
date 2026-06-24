const fs = require('fs');
const p = 'astro.config.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.split("          ],n          allow: '/'").join("          ],\n          allow: '/'");
fs.writeFileSync(p, s, 'utf8');
console.log('OK fix2');
