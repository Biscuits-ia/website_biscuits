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

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const userId = typeof body.user_id === 'string' ? body.user_id : '';

  if (!projectId || !userId) return jsonError('project_id et user_id sont requis.');

  const { error } = await adminSupabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId });

  if (error) {
    if (error.code === '23505') {
      return jsonError('Ce bénévole est déjà affecté au projet.', 409);
    }
    console.error('[api/admin/project-members] POST error:', error.message);
    return jsonError('Erreur lors de l\'affectation.', 500);
  }

  return jsonOk({ ok: true }, 201);
};

export const DELETE: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();

  const projectId = Astro.url.searchParams.get('project_id') ?? '';
  const userId = Astro.url.searchParams.get('user_id') ?? '';
  if (!projectId || !userId) return jsonError('project_id et user_id sont requis.');

  const { error } = await adminSupabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    console.error('[api/admin/project-members] DELETE error:', error.message);
    return jsonError('Erreur lors du retrait.', 500);
  }

  return jsonOk({ ok: true });
};
