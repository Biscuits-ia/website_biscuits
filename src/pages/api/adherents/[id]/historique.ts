import type { APIRoute } from 'astro';
import { getAdherentsAuthContext, hasAnyRole, jsonError, jsonOk } from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, params, url, clientAddress }) => {
  const { ctx, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!ctx) return jsonError('Non autorise.', 401);
  if (rateLimitResponse) return rateLimitResponse;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const adherentId = (params.id ?? '').trim();
  if (!adherentId) return jsonError('id manquant.');

  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));

  const { data, error } = await ctx.adminSupabase
    .from('adherent_historiques')
    .select('id, adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, timestamp, utilisateur_id')
    .eq('adherent_id', adherentId)
    .order('timestamp', { ascending: false })
    .limit(limit);
 
  if (error) {
    console.error('[api/adherents/:id/historique] error:', error.message);
    return jsonError('Erreur lors du chargement de l\'historique.', 500);
  }

  return jsonOk({ data: data ?? [] });
};
