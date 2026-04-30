// src/pages/api/notifications.ts
// GET   ?limit=20&unread_only=true  → notifications de l'utilisateur
// PATCH                             → { ids?: string[] } mark-as-read (tous si ids absent)
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const prerender = false;

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });
}
function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function getUser(request: Request, cookies: Parameters<typeof createSupabaseClient>[0]['cookies']) {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const ctx = await getUser(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  const limit       = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
  const unreadOnly  = url.searchParams.get('unread_only') === 'true';

  let query = ctx.supabase
    .from('notifications')
    .select('id, type, payload, read, created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('read', false);

  const { data, error } = await query;
  if (error) return jsonError('Erreur serveur.', 500);

  const unreadCount = (data ?? []).filter(n => !n.read).length;
  return jsonOk({ data: data ?? [], unread_count: unreadCount });
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const ctx = await getUser(request, cookies);
  if (!ctx) return jsonError('Non autorisé.', 401);

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* mark all */ }

  let query = ctx.supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', ctx.user.id);

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = (body.ids as unknown[]).filter(id => typeof id === 'string') as string[];
    query = query.in('id', ids);
  }

  const { error } = await query;
  if (error) return jsonError('Erreur lors de la mise à jour.', 500);
  return jsonOk({ success: true });
};
