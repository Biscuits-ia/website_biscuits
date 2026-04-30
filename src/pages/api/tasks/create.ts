import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const urlRegex = /^https?:\/\/.+/i;

const schema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().max(5000).optional().nullable(),
  corps: z.enum(['DEV', 'DB', 'DESIGN', 'QA', 'DATA', 'PM']),
  task_type: z.string().min(2).max(64),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).default('P2'),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'testing', 'blocked', 'done']).default('backlog'),
  assignee_id: z.string().regex(uuidRegex, 'assignee_id invalide').nullable().optional(),
  sprint_id: z.string().regex(uuidRegex, 'sprint_id invalide').nullable().optional(),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  time_estimate_hours: z.number().min(0).max(9999).nullable().optional(),
  acceptance_criteria: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  definition_of_done: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  doc_link: z.string().regex(urlRegex, 'doc_link invalide').nullable().optional(),
  figma_link: z.string().regex(urlRegex, 'figma_link invalide').nullable().optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await Astro.request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation échouée', details: parsed.error.issues }, 422);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', auth.user.id).single();
  const role = profile?.role ?? auth.role ?? 'member';

  if (!['admin', 'pm', 'tech_lead', 'benevole', 'member', 'moderator', 'user'].includes(role)) {
    return json({ error: 'Action non autorisée pour ce rôle.' }, 403);
  }

  const requestedAssigneeId = parsed.data.assignee_id ?? null;
  const assigneeId = requestedAssigneeId === auth.user.id ? auth.user.id : null;

  const payload = {
    ...parsed.data,
    assignee_id: assigneeId,
    description: parsed.data.description || null,
    reporter_id: auth.user.id,
  };

  const { data, error } = await admin.from('tasks').insert(payload).select('id').single();
  if (error || !data) {
    console.error('[api/tasks/create] insert error:', error?.message);
    return json({ error: 'Erreur lors de la création de la tâche.' }, 500);
  }

  return json({ id: data.id }, 201);
};
