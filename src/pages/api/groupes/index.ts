import type { APIRoute } from 'astro';
import { getAdherentsAuthContextFlat, hasAnyRole, jsonError, jsonOk, normalizeString } from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const flat = await getAdherentsAuthContextFlat(request, cookies);
  if (!flat.ok) return jsonError('Non autorise.', flat.status);
  if (flat.rateLimitResponse) return flat.rateLimitResponse;
  const { ctx } = flat;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const { data, error } = await ctx.adminSupabase
    .from('groupes')
    .select('id, nom, description, created_at, updated_at')
    .order('nom', { ascending: true });

  if (error) {
    console.error('[api/groupes] list error:', error.message);
    return jsonError('Erreur lors du chargement des groupes.', 500);
  }

  return jsonOk({ data: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const flat = await getAdherentsAuthContextFlat(request, cookies);
  if (!flat.ok) return jsonError('Non autorise.', flat.status);
  if (flat.rateLimitResponse) return flat.rateLimitResponse;
  const { ctx } = flat;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier'])) {
    return jsonError('Acces refuse.', 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps JSON invalide.');
  }

  const nom = normalizeString(body.nom, 120);
  const description = normalizeString(body.description, 600);

  if (!nom) return jsonError('Le nom du groupe est requis.');

  const { data, error } = await ctx.adminSupabase
    .from('groupes')
    .insert({ nom, description: description || null })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return jsonError('Ce groupe existe deja.', 409);
    console.error('[api/groupes] create error:', error.message);
    return jsonError('Erreur lors de la creation du groupe.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};
