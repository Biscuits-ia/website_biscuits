import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any);
  if (auth instanceof Response) return auth;

  const id = Astro.params.id ?? '';
  if (!id) return json({ error: 'Paramètre id manquant.' }, 400);

  const admin = createSupabaseAdminClient();
  const [{ data: task, error: taskError }, { data: comments }, { data: history }] = await Promise.all([
    admin.from('tasks').select('*').eq('id', id).single(),
    admin.from('task_comments').select('id, content, created_at, author_id').eq('task_id', id).order('created_at', { ascending: false }).limit(100),
    admin.from('task_history').select('id, field_name, old_value, new_value, changed_at, changed_by').eq('task_id', id).order('changed_at', { ascending: false }).limit(100),
  ]);

  if (taskError || !task) return json({ error: 'Tâche introuvable.' }, 404);

  return json({ task, comments: comments ?? [], history: history ?? [] });
};

export const DELETE: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any);
  if (auth instanceof Response) return auth;

  const id = Astro.params.id ?? '';
  if (!id) return json({ error: 'Paramètre id manquant.' }, 400);

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', auth.user.id).single();
  const role = profile?.role ?? 'member';

  if (!['admin', 'pm', 'tech_lead'].includes(role)) {
    return json({ error: 'Suppression non autorisée.' }, 403);
  }

  const { error } = await admin.from('tasks').delete().eq('id', id);
  if (error) {
    console.error('[api/tasks/[id]] DELETE error:', error.message);
    return json({ error: 'Erreur lors de la suppression.' }, 500);
  }

  return json({ ok: true });
};
