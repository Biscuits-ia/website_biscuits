// src/pages/api/benevole/tasks.ts
// CRUD des tâches Kanban d'un projet, branché sur la table `project_tasks`.
// Le Task Hub a été retiré : la notion de "corps" n'existe plus (chaque bénévole
// voit les tâches des projets dont il est membre).
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
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const role = await fetchRoleSecure(user.id);
  if (!role || (role !== 'benevole' && role !== 'moderator' && role !== 'admin')) return null;
  const adminSupabase = createSupabaseAdminClient();
  return { adminSupabase, user, role };
}

interface TaskInput {
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  deadline: string | null;
  priority: 'low' | 'medium' | 'high';
  status:   'todo' | 'in_progress' | 'review' | 'done';
}

// Mapping priorité form → project_tasks (low/medium/high — identique)
function mapPriority(p: string): 'low' | 'medium' | 'high' {
  if (p === 'high' || p === 'medium' || p === 'low') return p;
  return 'medium';
}

// Mapping statut form (incluant les anciennes valeurs Hub) → project_tasks (4 valeurs)
function mapStatus(s: string): 'todo' | 'in_progress' | 'review' | 'done' {
  // Valeurs valides directes
  if (s === 'todo' || s === 'in_progress' || s === 'review' || s === 'done') return s;
  // Valeurs legacy du Task Hub à rabattre sur les nouvelles colonnes kanban
  if (s === 'backlog' || s === 'blocked')   return 'todo';
  if (s === 'in_review' || s === 'testing') return 'review';
  return 'todo';
}

function validateTaskFields(
  project_id: string,
  title: string,
  description: string | null,
): string | null {
  if (!project_id)                              return 'project_id est requis.';
  if (!title)                                   return 'Le titre est requis.';
  if (title.length > 200)                       return 'Le titre ne doit pas dépasser 200 caractères.';
  if (description && description.length > 1000) return 'La description ne doit pas dépasser 1000 caractères.';
  return null;
}

function parseTaskBody(body: Record<string, unknown>): { input?: TaskInput; error?: string } {
  const project_id  = typeof body.project_id  === 'string' ? body.project_id.trim()  : '';
  const title       = typeof body.title       === 'string' ? body.title.trim()       : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const assignee_id = typeof body.assignee_id === 'string' && body.assignee_id
    ? body.assignee_id.trim()
    : null;

  // project_tasks utilise `deadline` (date), l'ancien form envoyait `due_date`
  let deadline: string | null = null;
  if (typeof body.deadline === 'string' && body.deadline) deadline = body.deadline;
  else if (typeof body.due_date === 'string' && body.due_date) deadline = body.due_date;

  const priority = mapPriority(typeof body.priority === 'string' ? body.priority : 'medium');
  const status   = mapStatus(typeof body.status === 'string' ? body.status : '');

  const err = validateTaskFields(project_id, title, description);
  if (err) return { error: err };

  return {
    input: { project_id, title, description, assignee_id, deadline, priority, status },
  };
}

function buildTaskUpdates(
  body: Record<string, unknown>,
  isStaff: boolean,
): { updates: Record<string, unknown>; error?: string } {
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

  if (typeof body.status === 'string')   updates.status   = mapStatus(body.status);
  if (typeof body.priority === 'string') updates.priority = mapPriority(body.priority);

  // `deadline` est la colonne canonique, `due_date` accepté en alias rétro-compat
  if (typeof body.deadline === 'string')      updates.deadline = body.deadline || null;
  else if (typeof body.due_date === 'string') updates.deadline = body.due_date || null;

  if (isStaff && typeof body.assignee_id === 'string') {
    updates.assignee_id = body.assignee_id || null;
  }

  return { updates };
}

// ── POST /api/benevole/tasks — créer une tâche ────────────────────────────────
// Handler GET : liste les tasks d'un projet pour le front.
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

  // Vérifier que le projet existe (RLS le fait aussi, mais on veut un 404 propre)
  const { data: proj } = await supabase.from('projects').select('id').eq('id', input.project_id).single();
  if (!proj) return jsonError('Projet introuvable.', 404);

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      project_id:  input.project_id,
      title:       input.title,
      description: input.description,
      assignee_id: input.assignee_id,
      deadline:    input.deadline,
      priority:    input.priority,
      status:      input.status,
      created_by:  user.id,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/benevole/tasks] insert error:', error.message);
    return jsonError('Erreur lors de la création.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

// ── Helpers claim / unclaim ───────────────────────────────────────────────────
async function handleClaim(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  taskId: string,
  task: { assignee_id: string | null; project_id: string },
  userId: string,
  isStaff: boolean,
) {
  if (task.assignee_id) {
    return jsonError('Cette tâche est déjà prise par quelqu\'un d\'autre.', 409);
  }
  if (!isStaff) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', task.project_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) return jsonError('Vous devez être membre du projet pour prendre une tâche.', 403);
  }
  const { error } = await supabase
    .from('project_tasks')
    .update({ assignee_id: userId, status: 'in_progress' })
    .eq('id', taskId)
    .is('assignee_id', null);
  if (error) return jsonError('La tâche vient d\'être prise par quelqu\'un d\'autre.', 409);
  return jsonOk({ ok: true });
}

async function handleUnclaim(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  taskId: string,
  task: { assignee_id: string | null },
  userId: string,
  isStaff: boolean,
) {
  if (task.assignee_id !== userId && !isStaff) {
    return jsonError('Vous ne pouvez pas libérer une tâche qui ne vous est pas assignée.', 403);
  }
  const { error } = await supabase
    .from('project_tasks')
    .update({ assignee_id: null, status: 'todo' })
    .eq('id', taskId);
  if (error) return jsonError('Erreur lors de la libération.', 500);
  return jsonOk({ ok: true });
}

// ── PATCH /api/benevole/tasks?id=… — modifier une tâche ──────────────────────
export const PATCH: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { adminSupabase: supabase, user, role } = ctx;

  const taskId = url.searchParams.get('id');
  if (!taskId) return jsonError('Paramètre id manquant.');

  const { data: task } = await supabase
    .from('project_tasks')
    .select('created_by, assignee_id, project_id')
    .eq('id', taskId)
    .single();

  if (!task) return jsonError('Tâche introuvable.', 404);

  const isStaff = role === 'admin' || role === 'moderator';

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps de requête JSON invalide.'); }

  if (body.action === 'claim')   return handleClaim(supabase, taskId, task, user.id, isStaff);
  if (body.action === 'unclaim') return handleUnclaim(supabase, taskId, task, user.id, isStaff);

  // Mise à jour normale : auteur, assigné ou staff
  const isOwner = task.created_by === user.id || task.assignee_id === user.id;
  if (!isOwner && !isStaff) return jsonError('Non autorisé.', 403);

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