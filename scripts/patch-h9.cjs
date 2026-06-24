const fs = require('fs');
const NL = '\n';

const patches = [
  // _prefixed variables still trigger ts(6133). Easiest: just remove the declarations.
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const _cgvVersion = compliance?.cgv_version ?? null;\n', replace: '' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const _cgvDateActivation = compliance?.cgv_date_activation ?? null;\n', replace: '' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const _prochainAudit = compliance?.prochain_audit ?? null;\n', replace: '' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const _mediateurNom = compliance?.mediateur_nom ?? null;\n', replace: '' },
  { file: 'src/pages/dashboard/benevole/index.astro', find: 'const _taskStatusLabel: Record<string, string> = {\n  todo: \'Ã€ faire\', in_progress: \'En cours\', review: \'RÃ©vision\', done: \'TerminÃ©\',\n};\n', replace: '' },
  { file: 'src/pages/dashboard/benevole/project/[id].astro', find: '      const _status = col.getAttribute(\'data-status\');\n', replace: '' },
  // groupes/index.ts: rateLimitResponse destructured but never read. Drop the destructure but keep usage.
  { file: 'src/pages/api/groupes/index.ts', find: '  const { rateLimitResponse, ok, status, ctx: _ctx } = flat as any; void rateLimitResponse; void ok; void status; void _ctx;', replace: '  void flat;' },
];

for (const { file, find, replace } of patches) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(find)) { console.log('SKIP', file, JSON.stringify(find.slice(0,40))); continue; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s, 'utf8');
  console.log('OK', file);
}
