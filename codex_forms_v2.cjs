const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts') && p.includes('/api/')) apis[p] = fs.readFileSync(p, 'utf8');
  }
}
walk('src/pages/api');

const checks = [
  { url: '/api/contact', need: 'POST' },
  { url: '/api/recruitment', need: 'POST' },
  { url: '/api/newsletter', need: 'POST' },
  { url: '/api/auth/connexion', need: 'POST' },
  { url: '/api/auth/inscription', need: 'POST' },
  { url: '/api/auth/mot-de-passe-oublie', need: 'POST' },
  { url: '/api/auth/reinitialiser-mot-de-passe', need: 'POST' },
  { url: '/api/auth/update-password', need: 'POST' },
  { url: '/api/auth/update-profile', need: 'POST' },
  { url: '/api/auth/deconnexion', need: 'POST' },
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
  const file = Object.keys(apis).find(p => p.endsWith(c.url + '.ts'));
  if (!file) { console.log('MISSING FILE: ' + c.url); broken++; continue; }
  const src = apis[file];
  const re = new RegExp('export const ' + c.need + '\\\\b', 'i');
  if (!re.test(src)) {
    console.log('MISSING METHOD: ' + c.url + ' (expected ' + c.need + ')');
    broken++;
  } else {
    ok++;
  }
}
console.log('\\n' + ok + ' OK, ' + broken + ' broken');
