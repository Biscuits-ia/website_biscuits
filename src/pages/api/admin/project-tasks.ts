import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

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

function buildTaskUpdates(body: Record<string, unknown>): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return { updates, error: 'Le titre est requis.' };
    if (title.length > 200) return { updates, error: 'Le titre ne doit pas dépasser 200 caractères.' };
    updates.title = title;
  }

  if (typeof body.description === 'string') {
    const description = body.description.trim();
    if (description.length > 1000) return { updates, error: 'La description ne doit pas dépasser 1000 caractères.' };
    updates.description = description || null;
  }

  if (typeof body.status === 'string' && ['todo', 'in_progress', 'review', 'done'].includes(body.status)) {
    updates.status = body.status;
  }

  if (typeof body.priority === 'string' && ['low', 'medium', 'high'].includes(body.priority)) {
    updates.priority = body.priority;
  }

  if (typeof body.deadline === 'string') {
    updates.deadline = body.deadline || null;
  }

  if (typeof body.assignee_id === 'string') {
    updates.assignee_id = body.assignee_id || null;
  }

  if (typeof body.position === 'number') {
    updates.position = body.position;
  }

  return { updates };
}

function buildTaskInsert(body: Record<string, unknown>, userId: string): { payload?: Record<string, unknown>; error?: string } {
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const status = typeof body.status === 'string' && ['todo', 'in_progress', 'review', 'done'].includes(body.status)
    ? body.status
    : 'todo';
  const priority = typeof body.priority === 'string' && ['low', 'medium', 'high'].includes(body.priority)
    ? body.priority
    : 'medium';
  const assigneeId = typeof body.assignee_id === 'string' ? (body.assignee_id || null) : null;
  const deadline = typeof body.deadline === 'string' ? (body.deadline || null) : null;

  if (!projectId) return { error: 'project_id est requis.' };
  if (!title) return { error: 'Le titre est requis.' };
  if (title.length > 200) return { error: 'Le titre ne doit pas dépasser 200 caractères.' };
  if (description && description.length > 1000) return { error: 'La description ne doit pas dépasser 1000 caractères.' };

  return {
    payload: {
      project_id: projectId,
      title,
      description: description || null,
      status,
      priority,
      assignee_id: assigneeId,
      deadline,
      created_by: userId,
    },
  };
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const { payload, error: validationError } = buildTaskInsert(body, auth.user.id);
  if (validationError || !payload) return jsonError(validationError ?? 'Données invalides.');

  const { data, error } = await adminSupabase
    .from('project_tasks')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[api/admin/project-tasks] POST error:', error.message);
    return jsonError('Erreur lors de la création de la tâche.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

export const PATCH: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();
  const taskId = Astro.url.searchParams.get('id') ?? '';
  if (!taskId) return jsonError('Paramètre id manquant.');

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const { updates, error: validationError } = buildTaskUpdates(body);
  if (validationError) return jsonError(validationError);
  if (Object.keys(updates).length === 0) return jsonError('Aucune donnée à mettre à jour.');

  const { error } = await adminSupabase
    .from('project_tasks')
    .update(updates)
    .eq('id', taskId);

  if (error) {
    console.error('[api/admin/project-tasks] PATCH error:', error.message);
    return jsonError('Erreur lors de la mise à jour.', 500);
  }

  return jsonOk({ ok: true });
};

export const DELETE: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();
  const taskId = Astro.url.searchParams.get('id') ?? '';
  if (!taskId) return jsonError('Paramètre id manquant.');

  const { error } = await adminSupabase
    .from('project_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('[api/admin/project-tasks] DELETE error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
