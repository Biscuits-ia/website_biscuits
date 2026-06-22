import type { APIRoute } from 'astro';
import { getAdherentsAuthContext, hasAnyRole, jsonError, jsonOk, parsePagination } from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const q = (url.searchParams.get('q') ?? '').trim();
  const statut = (url.searchParams.get('statut') ?? '').trim();
  const dateFrom = (url.searchParams.get('date_from') ?? '').trim();
  const dateTo = (url.searchParams.get('date_to') ?? '').trim();
  const groupeId = (url.searchParams.get('groupe_id') ?? '').trim();
  const { page, limit, from, to } = parsePagination(url);

  let query = ctx.adminSupabase
    .from('adherents')
    .select('id, nom, prenom, email, telephone, adresse, date_adhesion, statut, adherent_groupes(groupe_id)', { count: 'exact' });

  if (statut) query = query.eq('statut', statut);
  if (dateFrom) query = query.gte('date_adhesion', dateFrom);
  if (dateTo) query = query.lte('date_adhesion', dateTo);

  if (q) {
    const safe = q.replaceAll('%', '').replaceAll('_', '');
    query = query.or([
      `nom.ilike.%${safe}%`,
      `prenom.ilike.%${safe}%`,
      `email.ilike.%${safe}%`,
      `telephone.ilike.%${safe}%`,
      `adresse.ilike.%${safe}%`,
    ].join(','));
  }

  if (groupeId) {
    query = query.eq('adherent_groupes.groupe_id', groupeId);
  }

  const { data, error, count } = await query
    .order('nom', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('[api/adherents/search] error:', error.message);
    return jsonError('Erreur lors de la recherche.', 500);
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
