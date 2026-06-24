const fs = require('fs');
const p = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(p, 'utf8');
// the line is line 30 - "if (rateLimitResponse)" is the GET one
// Let me grep for the line
const lines = s.split('\n');
console.log('line 30:', JSON.stringify(lines[29]));
console.log('line 31:', JSON.stringify(lines[30]));
console.log('line 32:', JSON.stringify(lines[31]));
