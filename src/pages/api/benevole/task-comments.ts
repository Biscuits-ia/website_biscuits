// src/pages/api/benevole/task-comments.ts
// GET  ?task_id=  → liste des commentaires avec auteur (threadés)
// POST            → { task_id, content, parent_id? }
// DELETE ?id=     → supprimer son propre commentaire
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

export const prerender = false;

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });
}
function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function auth(request: Request, cookies: Parameters<typeof createSupabaseClient>[0]['cookies']) {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await fetchRoleSecure(user.id);
  if (!role || !['benevole', 'moderator', 'admin'].includes(role)) return null;
  return { supabase, user, role };
}

// GET /api/benevole/task-comments?task_id=xxx
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await auth(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const taskId = url.searchParams.get('task_id');
  if (!taskId) return jsonError('task_id requis.');

  // Vérifier que l'utilisateur est membre du projet contenant cette tâche
  const { data: membership } = await ctx.supabase
    .from('project_tasks')
    .select('id, project_members!inner(user_id)')
    .eq('id', taskId)
    .eq('project_members.user_id', ctx.user.id)
    .maybeSingle();

  if (!membership) return jsonError('Accès refusé.', 403);

  const { data, error } = await ctx.supabase
    .from('task_comments')
    .select('id, task_id, content, parent_id, created_at, author_id, profiles!task_comments_author_id_fkey(full_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) return jsonError('Erreur serveur.', 500);
  return jsonOk({ data: data ?? [] });
};

// POST /api/benevole/task-comments
export const POST: APIRoute = async ({ request, cookies }) => {
  const ctx = await auth(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('JSON invalide.'); }

  const task_id   = typeof body.task_id   === 'string' ? body.task_id.trim()   : '';
  const content   = typeof body.content   === 'string' ? body.content.trim()   : '';
  const parent_id = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : null;

  if (!task_id)              return jsonError('task_id requis.');
  if (!content)              return jsonError('Le contenu est requis.');
  if (content.length > 2000) return jsonError('Commentaire trop long (max 2000 caractères).');

  // Vérifier que l'utilisateur est membre du projet
  const { data: membership } = await ctx.supabase
    .from('project_tasks')
    .select('id, project_id, project_members!inner(user_id)')
    .eq('id', task_id)
    .eq('project_members.user_id', ctx.user.id)
    .maybeSingle();

  if (!membership) return jsonError('Accès refusé.', 403);

  const { data: comment, error } = await ctx.supabase
    .from('task_comments')
    .insert({ task_id, author_id: ctx.user.id, content, parent_id })
    .select('id, content, parent_id, created_at, author_id, profiles!task_comments_author_id_fkey(full_name, email)')
    .single();

  if (error) return jsonError('Erreur lors de la création.', 500);

  // Extraire les mentions @handle et créer des notifications
  const mentions = [...content.matchAll(/@([a-zA-Z0-9_-]+)/g)].map(m => m[1].toLowerCase());
  if (mentions.length > 0) {
    // Trouver les membres du projet dont le nom correspond à une mention
    const { data: projectMembers } = await ctx.supabase
      .from('project_members')
      .select('user_id, profiles(full_name, email)')
      .eq('project_id', (membership as { project_id: string }).project_id);

    if (projectMembers) {
      const notificationsToInsert = projectMembers
        .filter(pm => {
          const profileArr = pm.profiles as Array<{ full_name: string | null; email: string }> | null;
          const profile = profileArr?.[0];
          if (!profile || pm.user_id === ctx.user.id) return false;
          const nameSlug = (profile.full_name ?? profile.email).toLowerCase().replaceAll(' ', '');
          const emailHandle = profile.email.split('@')[0].toLowerCase();
          return mentions.some(m => nameSlug.includes(m) || emailHandle.includes(m));
        })
        .map(pm => ({
          user_id: pm.user_id,
          type: 'mention' as const,
          payload: {
            task_id,
            comment_id: comment.id,
            author_id: ctx.user.id,
            content_preview: content.slice(0, 100),
          },
        }));

      if (notificationsToInsert.length > 0) {
        await ctx.supabase.from('notifications').insert(notificationsToInsert);
      }
    }
  }

  return jsonOk({ data: comment }, 201);
};

// DELETE /api/benevole/task-comments?id=xxx
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await auth(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const id = url.searchParams.get('id');
  if (!id) return jsonError('id requis.');

  const isStaff = ctx.role === 'admin' || ctx.role === 'moderator';
  let query = ctx.supabase.from('task_comments').delete().eq('id', id);
  if (!isStaff) query = query.eq('author_id', ctx.user.id);

  const { error } = await query;
  if (error) return jsonError('Erreur lors de la suppression.', 500);
  return jsonOk({ success: true });
};
