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

  const role = profile?.role ?? 'member';
  const isManager = ['admin', 'pm', 'tech_lead'].includes(role);
  const isAssignee = existingTask.assignee_id === auth.user.id;

  if (!isManager && !isAssignee) {
    return json({ error: 'Modification non autorisée.' }, 403);
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  delete updates.id;
  if ('description' in updates && updates.description === '') updates.description = null;

  const { error } = await admin.from('tasks').update(updates).eq('id', parsed.data.id);
  if (error) {
    console.error('[api/tasks/update] update error:', error.message);
    return json({ error: 'Erreur lors de la mise à jour.' }, 500);
  }

  return json({ ok: true });
};
