import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const schema = z.object({
  content: z.string().min(1).max(1500),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAuth(Astro as any);
  if (auth instanceof Response) return auth;

  const taskId = Astro.params.id ?? '';
  if (!taskId) return json({ error: 'Paramètre id manquant.' }, 400);

  let body: unknown;
  try {
    body = await Astro.request.json();
  } catch {
    return json({ error: 'JSON invalide.' }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation échouée.', details: parsed.error.issues }, 422);
  }

  const admin = createSupabaseAdminClient();

  const { data: task } = await admin.from('tasks').select('id').eq('id', taskId).single();
  if (!task) return json({ error: 'Tâche introuvable.' }, 404);

  const payload = {
    task_id: taskId,
    author_id: auth.user.id,
    content: parsed.data.content.trim(),
  };

  const { data, error } = await admin
    .from('task_comments')
    .insert(payload)
    .select('id, content, created_at, author_id')
    .single();

  if (error || !data) {
    console.error('[api/tasks/[id]/comments] POST error:', error?.message);
    return json({ error: 'Erreur lors de la création du commentaire.' }, 500);
  }

  return json({ comment: data }, 201);
};
