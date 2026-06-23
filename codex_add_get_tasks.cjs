const fs = require('fs');
const path = 'src/pages/api/benevole/tasks.ts';
let src = fs.readFileSync(path, 'utf8');
if (/export const GET\b/.test(src)) {
  console.log('GET existe deja');
  process.exit(0);
}
const newHandler = `// Handler GET : liste les tasks d'un projet pour le front.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorise.', 401);
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return jsonError('project_id requis.', 400);
  // Verifie que l'user est membre du projet
  const { data: membership } = await ctx.supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (!membership && ctx.role === 'benevole') {
    return jsonError('Acces refuse.', 403);
  }
  const { data, error } = await ctx.supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) return jsonError('Erreur lors du chargement.', 500);
  return jsonOk({ data: data ?? [] });
};

`;
const re = /^export const POST/m;
if (re.test(src)) {
  src = src.replace(re, newHandler + 'export const POST');
  fs.writeFileSync(path, src, 'utf8');
  console.log('GET handler ajoute a tasks.ts');
} else {
  console.log('POST introuvable, pas de modif');
}
