import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';

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

function buildProjectUpdates(body: Record<string, unknown>): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return { updates, error: 'Le titre est requis.' };
    if (title.length > 120) return { updates, error: 'Le titre ne doit pas dépasser 120 caractères.' };
    updates.title = title;
  }

  if (typeof body.description === 'string') {
    const description = body.description.trim();
    if (description.length > 800) return { updates, error: 'La description ne doit pas dépasser 800 caractères.' };
    updates.description = description || null;
  }

  if (typeof body.status === 'string' && ['active', 'on_hold', 'completed', 'archived'].includes(body.status)) {
    updates.status = body.status;
  }

  if (typeof body.priority === 'string' && ['low', 'medium', 'high'].includes(body.priority)) {
    updates.priority = body.priority;
  }

  if (typeof body.deadline === 'string') {
    updates.deadline = body.deadline || null;
  }

  if (typeof body.leader_id === 'string') {
    updates.leader_id = body.leader_id || null;
  }

  return { updates };
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const priority = typeof body.priority === 'string' && ['low', 'medium', 'high'].includes(body.priority)
    ? body.priority
    : 'medium';
  const deadline = typeof body.deadline === 'string' ? (body.deadline || null) : null;

  if (!title) return jsonError('Le titre est requis.');
  if (title.length > 120) return jsonError('Le titre ne doit pas dépasser 120 caractères.');
  if (description && description.length > 800) return jsonError('La description ne doit pas dépasser 800 caractères.');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      title,
      description: description || null,
      priority,
      deadline,
      created_by: user.id,
      leader_id: user.id,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/admin/projects] insert error:', error.message);
    return jsonError('Erreur lors de la création.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

export const PATCH: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const projectId = Astro.url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const { updates, error: validationError } = buildProjectUpdates(body);
  if (validationError) return jsonError(validationError);
  if (Object.keys(updates).length === 0) return jsonError('Aucune donnée à mettre à jour.');

  const { error } = await auth.supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) {
    console.error('[api/admin/projects] update error:', error.message);
    return jsonError('Erreur lors de la mise à jour.', 500);
  }

  return jsonOk({ ok: true });
};

export const DELETE: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const projectId = Astro.url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { error } = await auth.supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('[api/admin/projects] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
