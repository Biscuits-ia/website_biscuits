const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts')) {
      const norm = p.replace(/\\/g, '/');
      const re = /\/pages\/(api|auth)\/(.+)\.ts$/;
      const m = norm.match(re);
      let rel = '';
      if (m) rel = '/' + m[1] + '/' + m[2];
      if (rel) apis[rel] = fs.readFileSync(p, 'utf8');
    }
  }
}
walk('src/pages/api');
walk('src/pages/auth');

function findApi(url) {
  if (url.includes('/[')) return apis[url.split('/[')[0]];
  return apis[url];
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
const missing = [];
for (const c of checks) {
  const src = findApi(c.url);
  if (!src) { missing.push(c.url + ' (FILE MISSING)'); broken++; continue; }
  const re = new RegExp('export\\s+const\\s+' + c.need + '\\b');
  if (!re.test(src)) { missing.push(c.url + ' (NO ' + c.need + ')'); broken++; }
  else { ok++; }
}
console.log('OK: ' + ok + ' / ' + checks.length);
console.log('KO: ' + broken);
if (missing.length) {
  console.log('\\nManquants:');
  for (const m of missing) console.log('  - ' + m);
}
