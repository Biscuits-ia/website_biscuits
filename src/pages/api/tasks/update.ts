import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  id: z.string().regex(uuidRegex, 'ID invalide'),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'testing', 'blocked', 'done']).optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  assignee_id: z.string().regex(uuidRegex, 'assignee_id invalide').nullable().optional(),
  blocked_reason: z.string().max(500).nullable().optional(),
  time_spent_hours: z.number().min(0).max(9999).nullable().optional(),
  title: z.string().min(10).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
}).refine((v) => Object.keys(v).some((k) => k !== 'id'), 'Aucune donnée à mettre à jour');

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function isStatusOnlyUpdate(payload: z.infer<typeof patchSchema>) {
  const allowedKeys = new Set(['id', 'status']);
  return Object.keys(payload).every((key) => allowedKeys.has(key)) && payload.status !== undefined;
}

function canEditTask(args: {
  isManager: boolean;
  isAssignee: boolean;
  isStatusOnly: boolean;
  assigneeIdInPatch: string | null | undefined;
  currentUserId: string;
  currentAssigneeId: string | null;
}) {
  const { isManager, isAssignee, isStatusOnly, assigneeIdInPatch, currentUserId, currentAssigneeId } = args;
  if (isManager || isAssignee || isStatusOnly) return true;
  return assigneeIdInPatch === currentUserId && currentAssigneeId === null;
}

function validateAssigneeChange(args: {
  hasAssigneeChange: boolean;
  requestedAssignee: string | null | undefined;
  currentUserId: string;
  currentAssigneeId: string | null;
  isVolunteerLike: boolean;
}) {
  const { hasAssigneeChange, requestedAssignee, currentUserId, currentAssigneeId, isVolunteerLike } = args;
  if (!hasAssigneeChange) return null;

  const isSelf = requestedAssignee === currentUserId;
  const isUnassign = requestedAssignee === null;

  if (!isSelf && !isUnassign) {
    return { status: 403, error: 'Attribution non autorisée. Une tâche ne peut être attribuée qu\'à soi-même.' };
  }

  if (isVolunteerLike && isSelf && currentAssigneeId && currentAssigneeId !== currentUserId) {
    return { status: 409, error: 'Cette tâche est déjà prise par un autre bénévole.' };
  }

  if (isVolunteerLike && isUnassign && currentAssigneeId !== currentUserId) {
    return { status: 403, error: 'Vous ne pouvez libérer que vos propres tâches.' };
  }

  return null;
}

export const PATCH: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await Astro.request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation échouée', details: parsed.error.issues }, 422);
  }

  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: existingTask }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', auth.user.id).single(),
    admin.from('tasks').select('id, assignee_id').eq('id', parsed.data.id).single(),
  ]);

  if (!existingTask) return json({ error: 'Tâche introuvable' }, 404);

  const role = profile?.role ?? auth.role ?? 'member';
  const isManager = ['admin', 'pm', 'tech_lead'].includes(role);
  const isAssignee = existingTask.assignee_id === auth.user.id;
  const isVolunteerLike = ['benevole', 'member', 'user', 'moderator'].includes(role);
  const statusOnlyUpdate = isStatusOnlyUpdate(parsed.data);

  if (!canEditTask({
    isManager,
    isAssignee,
    isStatusOnly: statusOnlyUpdate,
    assigneeIdInPatch: parsed.data.assignee_id,
    currentUserId: auth.user.id,
    currentAssigneeId: existingTask.assignee_id,
  })) {
    return json({ error: 'Modification non autorisée.' }, 403);
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  delete updates.id;
  if ('description' in updates && updates.description === '') updates.description = null;

  const assigneeError = validateAssigneeChange({
    hasAssigneeChange: 'assignee_id' in updates,
    requestedAssignee: parsed.data.assignee_id,
    currentUserId: auth.user.id,
    currentAssigneeId: existingTask.assignee_id,
    isVolunteerLike,
  });
  if (assigneeError) {
    return json({ error: assigneeError.error }, assigneeError.status);
  }

  const { error } = await admin.from('tasks').update(updates).eq('id', parsed.data.id);
  if (error) {
    console.error('[api/tasks/update] update error:', error.message);
    return json({ error: 'Erreur lors de la mise à jour.' }, 500);
  }

  return json({ ok: true });
};
