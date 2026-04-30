// src/pages/api/benevole/projects.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
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
  return { supabase, user, role };
}

// ── POST /api/benevole/projects — créer un projet ─────────────────────────────
export const POST: APIRoute = async ({ request, cookies }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, user, role } = ctx;

  // Seuls le staff peut créer un projet
  if (role !== 'admin' && role !== 'moderator') {
    return jsonError('Réservé au staff.', 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const title       = typeof body.title       === 'string' ? body.title.trim()       : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const priority    = ['low', 'medium', 'high'].includes(body.priority as string)
    ? (body.priority as string) : 'medium';
  const deadline    = typeof body.deadline === 'string' && body.deadline ? body.deadline : null;

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
      leader_id:  user.id,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/benevole/projects] insert error:', error.message);
    return jsonError('Erreur lors de la création.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

// ── PATCH /api/benevole/projects?id=… — modifier un projet ───────────────────
function buildProjectUpdates(body: Record<string, unknown>): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t)             return { updates, error: 'Le titre est requis.' };
    if (t.length > 120) return { updates, error: 'Le titre ne doit pas dépasser 120 caractères.' };
    updates.title = t;
  }
  if (typeof body.description === 'string') {
    const d = body.description.trim();
    if (d.length > 800) return { updates, error: 'La description ne doit pas dépasser 800 caractères.' };
    updates.description = d || null;
  }
  if (['low', 'medium', 'high'].includes(body.priority as string))              updates.priority = body.priority;
  if (['active', 'on_hold', 'completed', 'archived'].includes(body.status as string)) updates.status = body.status;
  if (typeof body.deadline === 'string') updates.deadline = body.deadline || null;
  return { updates };
}

export const PATCH: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, user, role } = ctx;

  const projectId = url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { data: proj } = await supabase
    .from('projects')
    .select('leader_id')
    .eq('id', projectId)
    .single();

  if (!proj) return jsonError('Projet introuvable.', 404);

  const isStaff  = role === 'admin' || role === 'moderator';
  if (proj.leader_id !== user.id && !isStaff) return jsonError('Non autorisé.', 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps de requête JSON invalide.'); }

  const { updates, error: valErr } = buildProjectUpdates(body);
  if (valErr) return jsonError(valErr);
  if (Object.keys(updates).length === 0) return jsonError('Aucune donnée à mettre à jour.');

  const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
  if (error) {
    console.error('[api/benevole/projects] update error:', error.message);
    return jsonError('Erreur lors de la mise à jour.', 500);
  }

  return jsonOk({ ok: true });
};

// ── DELETE /api/benevole/projects?id=… — supprimer un projet ─────────────────
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, role } = ctx;

  if (role !== 'admin') return jsonError('Réservé aux admins.', 403);

  const projectId = url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { error } = await supabase.from('projects').delete().eq('id', projectId);

  if (error) {
    console.error('[api/benevole/projects] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
