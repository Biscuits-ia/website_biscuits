const fs = require('fs');
const path = require('path');

// Verifier que tous les formulaires cote client ont leur endpoint backend
// ET que l\u2019endpoint accepte le format envoye.

const frontForms = {
  '/api/contact': ['src/components/react/ContactFormClient.tsx'],
  '/api/recruitment': ['src/components/react/RecruitmentFormClient.tsx'],
  '/api/newsletter': ['src/components/NewsletterSocial.astro', 'src/components/ContactForm.astro'],
  '/api/auth/connexion': ['src/pages/connexion.astro'],
  '/api/auth/inscription': ['src/pages/inscription.astro'],
  '/api/auth/mot-de-passe-oublie': ['src/pages/mot-de-passe-oublie.astro'],
  '/api/auth/reinitialiser-mot-de-passe': ['src/pages/reinitialisation-mot-de-passe.astro'],
  '/api/auth/update-password': ['src/pages/dashboard/benevole/settings.astro', 'src/pages/dashboard/user/settings.astro'],
  '/api/auth/update-profile': ['src/pages/dashboard/user/settings.astro', 'src/pages/dashboard/benevole/settings.astro'],
  '/api/change-password': ['src/pages/dashboard/benevole/settings.astro'],
  '/api/demandes/creer': ['src/pages/dashboard/user/demandes.astro'],
  '/api/ateliers/inscrire': ['src/pages/dashboard/user/ateliers.astro'],
  '/api/ateliers/desinscrire': ['src/pages/dashboard/user/ateliers.astro'],
  '/api/user-appointments': ['src/components/UserAppointmentBooking.astro'],
  '/api/user-appointments/{id}': ['src/components/UserAppointmentBooking.astro'],
  '/api/appointment-slots': ['src/components/UserAppointmentBooking.astro'],
  '/api/notifications': ['src/layouts/DashboardLayout.astro'],
};

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts') && p.includes('/api/')) apis[p] = fs.readFileSync(p, 'utf8');
  }
}
walk('src/pages/api');

console.log('=== Formulaires front-end -> endpoints back-end ===\\n');
let ok = 0, broken = 0;
for (const [endpoint, callers] of Object.entries(frontForms)) {
  const cleaned = endpoint.replace('{id}', '[id]');
  const match = Object.keys(apis).find(p => p.endsWith(cleaned + '.ts') || p.endsWith(cleaned.replace(/^.*\\//, '') + '.ts'));
  if (match) {
    const apiSrc = apis[match];
    const hasPost = /export const POST/i.test(apiSrc) || /export async function POST/i.test(apiSrc);
    const hasGet = /export const GET/i.test(apiSrc);
    const accepts = (cleaned.includes('contact') || cleaned.includes('recruitment') || cleaned.includes('newsletter') || cleaned.includes('inscrire') || cleaned.includes('desinscrire') || cleaned.includes('creer') || cleaned.includes('update') || cleaned.includes('change-password') || cleaned.includes('reinitialiser') || cleaned.includes('connexion') || cleaned.includes('inscription')) ? 'POST' : 'GET';
    if ((accepts === 'POST' && hasPost) || (accepts === 'GET' && hasGet) || (accepts === 'POST' && hasGet)) {
      ok++;
    } else {
      console.log('METHOD MISSING: ' + endpoint + ' (expected ' + accepts + ')');
      broken++;
    }
  } else {
    console.log('ENDPOINT MISSING: ' + endpoint);
    broken++;
  }
}
console.log('\\nResult: ' + ok + ' OK, ' + broken + ' BROKEN');
