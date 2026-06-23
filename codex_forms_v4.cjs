const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts')) {
      // /api/* et /auth/*
      if (p.includes('pages\\api\\') || p.includes('pages/auth/')) {
        apis[p] = fs.readFileSync(p, 'utf8');
      }
    }
  }
}
walk('src/pages');

function findApi(url) {
  // /api/contact -> cherche dans pages/api
  // /auth/connexion -> cherche dans pages/auth
  if (url.startsWith('/api/')) {
    const tail = url.slice(5); // 'contact'
    return Object.keys(apis).find(p => p.includes('pages\\api\\' + tail) || p.includes('pages/api/' + tail));
  } else if (url.startsWith('/auth/')) {
    const tail = url.slice(6); // 'connexion'
    return Object.keys(apis).find(p => p.endsWith('pages\\auth\\' + tail + '.ts') || p.endsWith('pages/auth/' + tail + '.ts'));
  }
  return undefined;
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
  const src = apis[file];
  const re = new RegExp('export const ' + c.need + '\\\\b', 'i');
  if (!re.test(src)) { console.log('NO ' + c.need + ': ' + c.url); broken++; }
  else { ok++; }
}
console.log('\\n' + ok + ' OK, ' + broken + ' broken');
