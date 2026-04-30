// src/pages/api/benevole/tasks.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getAuthContext(request: Request, cookies: any) {
  const adminSupabase = createSupabaseAdminClient();
  const { data: { user }, error } = await adminSupabase.auth.getUser();
  if (error || !user) return null;
  const role = await fetchRoleSecure(user.id);
  if (!role || (role !== 'benevole' && role !== 'moderator' && role !== 'admin')) return null;
  return { adminSupabase, user, role };
}

interface TaskInput {
  project_id: string; title: string; description: string | null;
  assignee_id: string | null; deadline: string | null;
  priority: string; status: string;
}

function parseTaskBody(body: Record<string, unknown>): { input?: TaskInput; error?: string } {
  const project_id  = typeof body.project_id === 'string' ? body.project_id.trim() : '';
  const title       = typeof body.title       === 'string' ? body.title.trim()      : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const assignee_id = typeof body.assignee_id === 'string' && body.assignee_id ? body.assignee_id.trim() : null;
  const deadline    = typeof body.deadline    === 'string' && body.deadline ? body.deadline : null;
  const priority    = ['low', 'medium', 'high'].includes(body.priority as string) ? (body.priority as string) : 'medium';
  const status      = ['todo', 'in_progress', 'review', 'done'].includes(body.status as string) ? (body.status as string) : 'todo';

  if (!project_id)             return { error: 'project_id est requis.' };
  if (!title)                  return { error: 'Le titre est requis.' };
  if (title.length > 200)      return { error: 'Le titre ne doit pas dépasser 200 caractères.' };
  if (description && description.length > 1000) return { error: 'La description ne doit pas dépasser 1000 caractères.' };
  return { input: { project_id, title, description, assignee_id, deadline, priority, status } };
}

function buildTaskUpdates(body: Record<string, unknown>, isStaff: boolean): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t)             return { updates, error: 'Le titre est requis.' };
    if (t.length > 200) return { updates, error: 'Le titre ne doit pas dépasser 200 caractères.' };
    updates.title = t;
  }
  if (typeof body.description === 'string') {
    const d = body.description.trim();
    if (d.length > 1000) return { updates, error: 'La description ne doit pas dépasser 1000 caractères.' };
    updates.description = d || null;
  }
  if (['todo', 'in_progress', 'review', 'done'].includes(body.status as string)) updates.status = body.status;
  if (['low', 'medium', 'high'].includes(body.priority as string))                updates.priority = body.priority;
  if (typeof body.deadline === 'string') updates.deadline = body.deadline || null;
  if (isStaff && typeof body.assignee_id === 'string')                            updates.assignee_id = body.assignee_id || null;
  return { updates };
}

// ── POST /api/benevole/tasks — créer une tâche ────────────────────────────────
export const POST: APIRoute = async ({ request, cookies }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { adminSupabase: supabase, user, role } = ctx;
  if (role !== 'admin' && role !== 'moderator') return jsonError('Réservé au staff.', 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps de requête JSON invalide.'); }

  const { input, error: parseErr } = parseTaskBody(body);
  if (parseErr || !input) return jsonError(parseErr ?? 'Données invalides.');

  const { data: proj } = await supabase.from('projects').select('id').eq('id', input.project_id).single();
  if (!proj) return jsonError('Projet introuvable.', 404);

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({ ...input, created_by: user.id })
    .select('id')
    .single();

  if (error) {
    console.error('[api/benevole/tasks] insert error:', error.message);
    return jsonError('Erreur lors de la création.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

// ── PATCH /api/benevole/tasks?id=… — modifier une tâche ──────────────────────
export const PATCH: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { adminSupabase: supabase, user, role } = ctx;

  const taskId = url.searchParams.get('id');
  if (!taskId) return jsonError('Paramètre id manquant.');

  const { data: task } = await supabase
    .from('project_tasks')
    .select('created_by, assignee_id')
    .eq('id', taskId)
    .single();

  if (!task) return jsonError('Tâche introuvable.', 404);

  const isStaff = role === 'admin' || role === 'moderator';
  const isOwner = task.created_by === user.id || task.assignee_id === user.id;
  if (!isOwner && !isStaff) return jsonError('Non autorisé.', 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps de requête JSON invalide.'); }

  const { updates, error: valErr } = buildTaskUpdates(body, isStaff);
  if (valErr) return jsonError(valErr);
  if (Object.keys(updates).length === 0) return jsonError('Aucune donnée à mettre à jour.');

  const { error } = await supabase.from('project_tasks').update(updates).eq('id', taskId);
  if (error) {
    console.error('[api/benevole/tasks] update error:', error.message);
    return jsonError('Erreur lors de la mise à jour.', 500);
  }

  return jsonOk({ ok: true });
};

// ── DELETE /api/benevole/tasks?id=… — supprimer une tâche ────────────────────
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { adminSupabase: supabase, user, role } = ctx;

  const taskId = url.searchParams.get('id');
  if (!taskId) return jsonError('Paramètre id manquant.');

  // Vérifier que l'utilisateur est créateur ou staff
  const { data: task } = await supabase
    .from('project_tasks')
    .select('created_by')
    .eq('id', taskId)
    .single();

  if (!task) return jsonError('Tâche introuvable.', 404);

  const isCreator = task.created_by === user.id;
  const isStaff   = role === 'admin' || role === 'moderator';
  if (!isCreator && !isStaff) return jsonError('Non autorisé.', 403);

  const { error } = await supabase.from('project_tasks').delete().eq('id', taskId);

  if (error) {
    console.error('[api/benevole/tasks] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
