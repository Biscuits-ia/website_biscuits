// src/pages/api/benevole/projects.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
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

  const { user, role } = ctx;
  const adminSupabase = createSupabaseAdminClient();

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

  const { data, error } = await adminSupabase
    .from('projects')
    .insert({
      title,
      description: description || null,
      status: 'active',
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

  // Associer automatiquement le créateur au projet pour la visibilité membre.
  const { error: memberError } = await adminSupabase
    .from('project_members')
    .upsert({ project_id: data.id, user_id: user.id }, { onConflict: 'project_id,user_id' });

  if (memberError) {
    console.error('[api/benevole/projects] member upsert warning:', memberError.message);
  }

  // Hard verification: ensure row is actually present right after insert.
  const { data: insertedProject, error: verifyError } = await adminSupabase
    .from('projects')
    .select('id, title, created_by, leader_id, created_at')
    .eq('id', data.id)
    .maybeSingle();

  if (verifyError || !insertedProject) {
    console.error('[api/benevole/projects][POST] verify failed:', data.id, verifyError?.message);
    return jsonError('Creation non confirmee en base.', 500);
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
  if (typeof body.deadline    === 'string') updates.deadline    = body.deadline    || null;
  if (typeof body.start_date  === 'string') updates.start_date  = body.start_date  || null;
  if (typeof body.objective   === 'string') {
    const v = body.objective.trim();
    if (v.length > 600) return { updates, error: "L'objectif ne doit pas dépasser 600 caractères." };
    updates.objective = v || null;
  }
  if (typeof body.expected_deliverables === 'string') {
    const v = body.expected_deliverables.trim();
    if (v.length > 600) return { updates, error: 'Les livrables ne doivent pas dépasser 600 caractères.' };
    updates.expected_deliverables = v || null;
  }
  if (typeof body.tech_stack === 'string') {
    updates.tech_stack = body.tech_stack ? body.tech_stack.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  } else if (Array.isArray(body.tech_stack)) {
    updates.tech_stack = body.tech_stack;
  }
  if (typeof body.tools === 'string') {
    updates.tools = body.tools ? body.tools.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  } else if (Array.isArray(body.tools)) {
    updates.tools = body.tools;
  }
  if (typeof body.repository_url       === 'string') updates.repository_url       = body.repository_url.trim()       || null;
  if (typeof body.document_url         === 'string') updates.document_url         = body.document_url.trim()         || null;
  if (typeof body.communication_channel === 'string') updates.communication_channel = body.communication_channel.trim() || null;
  if (body.estimated_hours !== undefined && body.estimated_hours !== '') {
    const h = Number(body.estimated_hours);
    if (!Number.isNaN(h) && h >= 0) updates.estimated_hours = h;
  } else if (body.estimated_hours === '') {
    updates.estimated_hours = null;
  }
  return { updates };
}

export const PATCH: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { user, role } = ctx;
  const adminSupabase = createSupabaseAdminClient();

  const projectId = url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { data: proj } = await adminSupabase
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

  const { error } = await adminSupabase.from('projects').update(updates).eq('id', projectId);
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

  const { role } = ctx;
  const adminSupabase = createSupabaseAdminClient();

  if (role !== 'admin') return jsonError('Réservé aux admins.', 403);

  const projectId = url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { error } = await adminSupabase.from('projects').delete().eq('id', projectId);

  if (error) {
    console.error('[api/benevole/projects] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
