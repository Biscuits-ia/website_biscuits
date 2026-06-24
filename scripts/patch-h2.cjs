const fs = require('fs');
const path = 'src/components/react/AdminAppointmentsCalendar.tsx';
let s = fs.readFileSync(path, 'utf8');
s = s.replace('async (e: React.FormEvent<HTMLFormElement>) => {',
              'async (e: React.SyntheticEvent<HTMLFormElement>) => {');
fs.writeFileSync(path, s, 'utf8');
console.log('OK h2 AdminAppointmentsCalendar');
