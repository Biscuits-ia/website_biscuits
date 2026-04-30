import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const ALLOWED_TASK_TYPES = ['general', 'dev', 'db', 'design', 'qa', 'ops', 'doc'] as const;
const ALLOWED_STATUS = ['todo', 'in_progress', 'review', 'done'] as const;
const ALLOWED_PRIORITY = ['low', 'medium', 'high'] as const;

function pickEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number]) ? (value as T[number]) : fallback;
}

function getString(body: Record<string, unknown>, key: string): string | null {
  return typeof body[key] === 'string' ? body[key] : null;
}

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
  const titleRaw = getString(body, 'title');
  const descriptionRaw = getString(body, 'description');
  const deadlineRaw = getString(body, 'deadline');
  const assigneeRaw = getString(body, 'assignee_id');

  if (titleRaw !== null) {
    const title = titleRaw.trim();
    if (!title) return { updates, error: 'Le titre est requis.' };
    if (title.length > 200) return { updates, error: 'Le titre ne doit pas dépasser 200 caractères.' };
    updates.title = title;
  }

  if (descriptionRaw !== null) {
    const description = descriptionRaw.trim();
    if (description.length > 1000) return { updates, error: 'La description ne doit pas dépasser 1000 caractères.' };
    updates.description = description || null;
  }

  if (getString(body, 'status') !== null) {
    updates.status = pickEnum(body.status, ALLOWED_STATUS, 'todo');
  }

  if (getString(body, 'priority') !== null) {
    updates.priority = pickEnum(body.priority, ALLOWED_PRIORITY, 'medium');
  }

  if (getString(body, 'task_type') !== null) {
    updates.task_type = pickEnum(body.task_type, ALLOWED_TASK_TYPES, 'general');
  }

  if (deadlineRaw !== null) {
    updates.deadline = deadlineRaw || null;
  }

  if (assigneeRaw !== null) {
    updates.assignee_id = assigneeRaw || null;
  }

  if (typeof body.position === 'number') {
    updates.position = body.position;
  }

  return { updates };
}

function buildTaskInsert(body: Record<string, unknown>, userId: string): { payload?: Record<string, unknown>; error?: string } {
  const projectId = getString(body, 'project_id') ?? '';
  const title = (getString(body, 'title') ?? '').trim();
  const description = (getString(body, 'description') ?? '').trim();
  const status = pickEnum(body.status, ALLOWED_STATUS, 'todo');
  const priority = pickEnum(body.priority, ALLOWED_PRIORITY, 'medium');
  const assigneeId = getString(body, 'assignee_id') || null;
  const deadline = getString(body, 'deadline') || null;
  const taskType = pickEnum(body.task_type, ALLOWED_TASK_TYPES, 'general');

  if (!projectId) return { error: 'project_id est requis.' };
  if (!title) return { error: 'Le titre est requis.' };
  if (title.length > 200) return { error: 'Le titre ne doit pas dépasser 200 caractères.' };
  if (description.length > 1000) return { error: 'La description ne doit pas dépasser 1000 caractères.' };

  return {
    payload: {
      project_id: projectId,
      title,
      description: description || null,
      status,
      priority,
      task_type: taskType,
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
