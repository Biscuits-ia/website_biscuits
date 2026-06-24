const fs = require('fs');
const path = 'src/components/react/VictimForm.tsx';
let s = fs.readFileSync(path, 'utf8');

// 1. Drop unused import MAX_SUBJECT
s = s.replace("import { EMAIL_RE, MAX_MESSAGE, MAX_NAME, MAX_SUBJECT, MIN_MESSAGE } from '@/lib/validation';",
              "import { EMAIL_RE, MAX_MESSAGE, MAX_NAME, MIN_MESSAGE } from '@/lib/validation';");

// 2. Replace FormEvent with React.FormEvent (no import change needed, just type usage)
s = s.replace('async (event: FormEvent<HTMLFormElement>) => {',
              'async (event: React.FormEvent<HTMLFormElement>) => {');

fs.writeFileSync(path, s, 'utf8');
console.log('OK h1 VictimForm');
