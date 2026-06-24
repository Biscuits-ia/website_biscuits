import type { APIRoute } from 'astro';
import { getAdherentsAuthContextFlat, hasAnyRole, jsonError, jsonOk } from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, params }) => {
  const flat = await getAdherentsAuthContextFlat(request, cookies);
  const { rateLimitResponse } = flat;
  if (!flat.ok) return jsonError('Non autorise.', flat.status);
  const { ctx } = flat;
  if (rateLimitResponse) return rateLimitResponse;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const groupeId = (params.id ?? '').trim();
  if (!groupeId) return jsonError('id manquant.');

  const { data, error } = await ctx.adminSupabase
    .from('adherent_groupes')
    .select('adherent_id, adherents(id, nom, prenom, email, telephone, adresse, date_adhesion, statut)')
    .eq('groupe_id', groupeId);

  if (error) {
    console.error('[api/groupes/:id/adherents] error:', error.message);
    return jsonError('Erreur lors du chargement des adherents du groupe.', 500);
  }

  return jsonOk({ data: data ?? [] });
};
