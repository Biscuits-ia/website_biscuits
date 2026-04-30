// src/pages/api/benevole/project-messages.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

export const prerender = false;

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

async function getAuthContext(request: Request, cookies: Parameters<typeof createSupabaseClient>[0]['cookies']) {
  const sessionSupabase = createSupabaseClient({ request, cookies });
  const { data: { user }, error } = await sessionSupabase.auth.getUser();
  if (error || !user) return null;
  const role = await fetchRoleSecure(user.id);
  if (!role || (role !== 'benevole' && role !== 'admin')) return null;
  return { supabase: createSupabaseAdminClient(), user, role };
}

// ── GET /api/benevole/project-messages?project_id=X[&since=ISO] ──────────────
// Retourne les 60 derniers messages (ou les messages depuis `since`)
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, user, role } = ctx;
  const projectId = url.searchParams.get('project_id') ?? '';
  const since     = url.searchParams.get('since') ?? '';
  if (!projectId) return jsonError('project_id est requis.');

  // Vérifier accès au projet
  const isAdmin = role === 'admin';
  if (!isAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return jsonError('Accès refusé.', 403);
  }

  let query = supabase
    .from('project_messages')
    .select('id, project_id, author_id, content, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (since) {
    query = query.gt('created_at', since);
  } else {
    query = query.limit(60);
  }

  const { data: messages, error } = await query;
  if (error) return jsonError('Erreur lors du chargement.', 500);

  if (!messages || messages.length === 0) return jsonOk({ data: [] });

  // Enrichir avec les noms d'auteurs
  const authorIds = [...new Set(messages.map((m) => m.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', authorIds);

  const profileMap: Record<string, string> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = p.full_name?.trim() || p.email?.trim() || p.id;
  }

  const enriched = messages.map((m) => ({
    ...m,
    author_name: profileMap[m.author_id] ?? 'Inconnu',
    is_own: m.author_id === user.id,
  }));

  return jsonOk({ data: enriched });
};

// ── POST /api/benevole/project-messages — envoyer un message ─────────────────
export const POST: APIRoute = async ({ request, cookies }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, user, role } = ctx;
  const isAdmin = role === 'admin';

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps de requête JSON invalide.'); }

  const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
  const content   = typeof body.content    === 'string' ? body.content.trim()    : '';

  if (!projectId) return jsonError('project_id est requis.');
  if (!content)   return jsonError('Le message ne peut pas être vide.');
  if (content.length > 2000) return jsonError('Le message ne doit pas dépasser 2000 caractères.');

  if (!isAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return jsonError('Vous devez être membre du projet pour envoyer un message.', 403);
  }

  const { data, error } = await supabase
    .from('project_messages')
    .insert({ project_id: projectId, author_id: user.id, content })
    .select('id, project_id, author_id, content, created_at')
    .single();

  if (error) {
    console.error('[api/benevole/project-messages] insert error:', error.message);
    return jsonError('Erreur lors de l\'envoi du message.', 500);
  }

  return jsonOk({ data }, 201);
};

// ── DELETE /api/benevole/project-messages?id=… — supprimer un message ────────
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getAuthContext(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const { supabase, user, role } = ctx;
  const messageId = url.searchParams.get('id') ?? '';
  if (!messageId) return jsonError('id est requis.');

  const { data: msg } = await supabase
    .from('project_messages')
    .select('author_id, project_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg) return jsonError('Message introuvable.', 404);

  const isAdmin = role === 'admin';
  if (!isAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', msg.project_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return jsonError('Non autorisé.', 403);
  }

  const { error } = await supabase
    .from('project_messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    console.error('[api/benevole/project-messages] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
