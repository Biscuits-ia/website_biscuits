import type { APIRoute } from 'astro';
import {
  buildAccessMetadata,
  getAdherentsAuthContext,
  hasAnyRole,
  jsonError,
  jsonOk,
  logAdherentOperation,
  parsePagination,
  validateAdherentPayload,
} from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const { page, limit, from, to } = parsePagination(url);
  const sortBy = (url.searchParams.get('sortBy') ?? 'date_adhesion').trim();
  const sortOrder = (url.searchParams.get('sortOrder') ?? 'desc').toLowerCase() === 'asc';
  const statut = (url.searchParams.get('statut') ?? '').trim();

  let query = ctx.adminSupabase
    .from('adherents')
    .select('id, nom, prenom, email, telephone, adresse, date_adhesion, statut, created_at, updated_at', { count: 'exact' });

  if (statut) query = query.eq('statut', statut);

  const allowedSortColumns = ['nom', 'prenom', 'email', 'date_adhesion', 'created_at', 'updated_at'];
  const orderCol = allowedSortColumns.includes(sortBy) ? sortBy : 'date_adhesion';

  const { data, error, count } = await query
    .order(orderCol, { ascending: sortOrder })
    .range(from, to);

  if (error) {
    console.error('[api/adherents] list error:', error.message);
    return jsonError('Erreur lors du chargement des adherents.', 500);
  }

  return jsonOk({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    },
  });
};

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier'])) {
    return jsonError('Acces refuse.', 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps JSON invalide.');
  }

  const { payload, error: validationError } = validateAdherentPayload(body, false);
  if (validationError || !payload) return jsonError(validationError ?? 'Donnnees invalides.');

  const access = buildAccessMetadata(request, clientAddress);

  const { data, error } = await ctx.adminSupabase
    .from('adherents')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return jsonError('Cet email existe deja.', 409);
    console.error('[api/adherents] create error:', error.message);
    return jsonError('Erreur lors de la creation.', 500);
  }

  // Log operation
  await logAdherentOperation(
    ctx.adminSupabase,
    'CREATE_ADHERENT',
    {
      old: null,
      new: { nom: payload.nom, prenom: payload.prenom, email: payload.email },
      utilisateur_id: ctx.userId,
      access,
      meta: { adherentId: data.id },
    }
  );

  return jsonOk({ id: data.id }, 201);
};
