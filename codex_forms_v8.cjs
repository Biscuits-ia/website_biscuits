const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      walk(p);
    } else if (item.name.endsWith('.ts')) {
      // Chemin relatif a pages/api/ ou pages/auth/
      const rel = p.split('pages\\').pop() || p.split('pages/').pop();
      apis[rel] = p;
    }
  }
}
walk('src/pages/api');
walk('src/pages/auth');

console.log('Total routes:', Object.keys(apis).length);
console.log('Sample:', Object.keys(apis).slice(0, 5));

function findApi(url) {
  if (url.startsWith('/api/')) {
    const tail = url.slice(5);
    const base = tail.split('/')[0] + '.ts';
    return apis[base];
  } else if (url.startsWith('/auth/')) {
    const base = url.slice(6) + '.ts';
    return apis[base];
  }
}

const checks = [
  { url: '/api/contact', need: 'POST' },
  { url: '/api/recruitment', need: 'POST' },
  { url: '/api/newsletter', need: 'POST' },
  { url: '/auth/connexion', need: 'POST' },
  { url: '/auth/inscription', need: 'POST' },
  { url: '/auth/mot-de-passe-oublie', need: 'POST' },
  { url: '/auth/reinitialiser-mot-de-passe', need: 'POST' },
  { url: '/auth/update-password', need: 'POST' },
  { url: '/auth/update-profile', need: 'POST' },
  { url: '/auth/deconnexion', need: 'POST' },
  { url: '/api/change-password', need: 'POST' },
  { url: '/api/demandes/creer', need: 'POST' },
  { url: '/api/ateliers/inscrire', need: 'POST' },
  { url: '/api/ateliers/desinscrire', need: 'POST' },
  { url: '/api/user-appointments', need: 'POST' },
  { url: '/api/user-appointments/[id]', need: 'DELETE' },
  { url: '/api/appointment-slots', need: 'GET' },
  { url: '/api/notifications', need: 'GET' },
  { url: '/api/admin/appointments', need: 'GET' },
  { url: '/api/admin/appointments/[id]', need: 'PATCH' },
  { url: '/api/benevole/projects', need: 'POST' },
  { url: '/api/benevole/tasks', need: 'GET' },
  { url: '/api/benevole/project-messages', need: 'GET' },
  { url: '/api/benevole/task-comments', need: 'GET' },
  { url: '/api/benevole/task-watchers', need: 'GET' },
  { url: '/api/admin/project-members', need: 'POST' },
  { url: '/api/admin/project-tasks', need: 'POST' },
  { url: '/api/admin/projects', need: 'POST' },
  { url: '/api/appointment-slots/[id]', need: 'PATCH' },
];

let ok = 0, broken = 0;
for (const c of checks) {
  const file = findApi(c.url);
  if (!file) { console.log('MISSING: ' + c.url); broken++; continue; }
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp('export const ' + c.need + '\\b');
  if (!re.test(src)) { console.log('NO ' + c.need + ': ' + c.url + ' in ' + path.basename(file)); broken++; }
  else { ok++; }
}
console.log('\n' + ok + ' OK, ' + broken + ' broken');
