// src/pages/api/benevole/task-watchers.ts
// GET    ?task_id=  → liste des watchers
// POST             → { task_id } — s'abonner
// DELETE ?task_id= — se désabonner
import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireBenevoleJson } from '@/lib/auth';

export const prerender = false;

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });
}
function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function isMember(supabase: SupabaseClient, taskId: string, userId: string) {
  const { data } = await supabase
    .from('project_tasks')
    .select('id, project_members!inner(user_id)')
    .eq('id', taskId)
    .eq('project_members.user_id', userId)
    .maybeSingle();
  return !!data;
}

export const GET: APIRoute = async (ctx) => {
  const auth = await requireBenevoleJson(ctx);
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;
  const { url } = ctx;

  const taskId = url.searchParams.get('task_id');
  if (!taskId) return jsonError('task_id requis.');
  if (!(await isMember(supabase, taskId, user.id))) return jsonError('Accès refusé.', 403);

  const { data, error } = await supabase
    .from('task_watchers')
    .select('user_id, profiles(full_name, email)')
    .eq('task_id', taskId);

  if (error) return jsonError('Erreur serveur.', 500);
  return jsonOk({ data: data ?? [] });
};

export const POST: APIRoute = async (ctx) => {
  const auth = await requireBenevoleJson(ctx);
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;
  const { request } = ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('JSON invalide.'); }

  const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : '';
  if (!taskId) return jsonError('task_id requis.');
  if (!(await isMember(supabase, taskId, user.id))) return jsonError('Accès refusé.', 403);

  const { error } = await supabase
    .from('task_watchers')
    .upsert({ task_id: taskId, user_id: user.id }, { onConflict: 'task_id,user_id' });

  if (error) return jsonError('Erreur lors de l\'abonnement.', 500);
  return jsonOk({ success: true }, 201);
};

export const DELETE: APIRoute = async (ctx) => {
  const auth = await requireBenevoleJson(ctx);
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;
  const { url } = ctx;

  const taskId = url.searchParams.get('task_id');
  if (!taskId) return jsonError('task_id requis.');

  const { error } = await supabase
    .from('task_watchers')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', user.id);

  if (error) return jsonError('Erreur lors du désabonnement.', 500);
  return jsonOk({ success: true });
};
