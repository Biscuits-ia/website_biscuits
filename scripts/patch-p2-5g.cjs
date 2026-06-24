const fs = require('fs');
const NL = '\n';

const files = [
  'src/pages/api/groupes/index.ts',
  'src/pages/api/groupes/[id]/adherents.ts',
];

for (const path of files) {
  let s = fs.readFileSync(path, 'utf8');

  // Replace pattern: `if (!ctx) return jsonError(...401)` => `if (!flat.ok) return jsonError(...flat.status)`
  // And ensure `flat` variable name
  // The current call-sites use `const { ctx, rateLimitResponse } = await getAdherentsAuthContextFlat(request, cookies);`
  // Switch to `const flat = await getAdherentsAuthContextFlat(...); const { ctx, rateLimitResponse } = flat.ok ? flat : null;`
  // Simpler: destructure and discriminate manually.

  // Pattern A: `const { ctx, rateLimitResponse } = await getAdherentsAuthContextFlat(request, cookies);`
  const patA = 'const { ctx, rateLimitResponse } = await getAdherentsAuthContextFlat(request, cookies);';
  const replA = 'const flat = await getAdherentsAuthContextFlat(request, cookies);' + NL +
                '  const { rateLimitResponse } = flat;' + NL +
                '  if (!flat.ok) return jsonError(' + String.fromCharCode(39) + 'Non autorise.' + String.fromCharCode(39) + ', flat.status);' + NL +
                '  const { ctx } = flat;';

  if (s.includes(patA)) {
    s = s.replace(patA, replA);
    // Remove the now-unused `if (!ctx) return jsonError('Non autorise.', 401);` line
    s = s.replace("  if (!ctx) return jsonError('Non autorise.', 401);" + NL, '');
    fs.writeFileSync(path, s, 'utf8');
    console.log('OK', path);
  } else {
    console.log('NO MATCH in', path);
  }
}
