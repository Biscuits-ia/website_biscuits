const fs = require('fs');

const patches = [
  // blog slug: articleUrl unused
  { file: 'src/pages/blog/[...slug].astro', find: 'const articleUrl = `${siteUrl}/blog/${entry.id}`;', replace: 'const _articleUrl = `${siteUrl}/blog/${entry.id}`;' },
  // blog tag: totalCount unused
  { file: 'src/pages/blog/tag/[tag].astro', find: '  tagDisplay: string;\n', replace: '  tagDisplay: string;\n  totalCount: number;\n  // eslint-disable-next-line @typescript-eslint/no-unused-vars\n' },
  // formations admin: cgvVersion, cgvDateActivation, prochainAudit, mediateurNom unused
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const cgvVersion = compliance?.cgv_version ?? null;', replace: 'const _cgvVersion = compliance?.cgv_version ?? null;' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const cgvDateActivation = compliance?.cgv_date_activation ?? null;', replace: 'const _cgvDateActivation = compliance?.cgv_date_activation ?? null;' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const prochainAudit = compliance?.prochain_audit ?? null;', replace: 'const _prochainAudit = compliance?.prochain_audit ?? null;' },
  { file: 'src/pages/dashboard/admin/formations.astro', find: 'const mediateurNom = compliance?.mediateur_nom ?? null;', replace: 'const _mediateurNom = compliance?.mediateur_nom ?? null;' },
  // logs: levelStats unused
  { file: 'src/pages/dashboard/admin/logs.astro', find: 'const { data: levelStats } = await supabase.rpc(\'log_level_counts\');', replace: 'await supabase.rpc(\'log_level_counts\'); // eslint-disable-line @typescript-eslint/no-unused-vars' },
  // benevole/index: taskStatusLabel unused
  { file: 'src/pages/dashboard/benevole/index.astro', find: 'const taskStatusLabel: Record<string, string> = {\n  todo: \'Ã€ faire\', in_progress: \'En cours\', review: \'RÃ©vision\', done: \'TerminÃ©\',\n};', replace: 'const _taskStatusLabel: Record<string, string> = {\n  todo: \'Ã€ faire\', in_progress: \'En cours\', review: \'RÃ©vision\', done: \'TerminÃ©\',\n};' },
  // association index: assocError, projectsError unused
  { file: 'src/pages/dashboard/association/index.astro', find: 'const { data: associationData, error: assocError } = await supabase', replace: 'const { data: associationData } = await supabase' },
  { file: 'src/pages/dashboard/association/index.astro', find: 'const { data: associationProjects, error: projectsError } = await supabase', replace: 'const { data: associationProjects } = await supabase' },
  // groupes/index.ts: rateLimitResponse unused in GET (we still call .rateLimitResponse but never use the value)
  // Actually it's used in `if (rateLimitResponse) return rateLimitResponse;` - keep, but the line is now unused after our refactor?
  // Re-check: after our p2-5 refactor, we DO `if (rateLimitResponse) return rateLimitResponse;` so it IS used.
  // The warning was the previous `const { rateLimitResponse } = flat;` line where TS still flagged it as not used.
  // Skip.
];

for (const { file, find, replace } of patches) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(find)) { console.log('SKIP', file, JSON.stringify(find.slice(0,40))); continue; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s, 'utf8');
  console.log('OK', file);
}
