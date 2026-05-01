import type { APIRoute } from 'astro';
import {
  buildAccessMetadata,
  getAdherentsAuthContext,
  hasAnyRole,
  jsonError,
  logAdherentOperation,
  toCsvCell,
  toCsvResponse,
} from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, clientAddress }) => {
  const { ctx, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!ctx) return jsonError('Non autorise.', 401);
  if (rateLimitResponse) return rateLimitResponse;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const { data, error } = await ctx.adminSupabase
    .from('adherents')
    .select('nom, prenom, email, telephone, adresse, date_adhesion, statut')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/adherents/export] error:', error.message);
    return jsonError('Erreur lors de l\'export.', 500);
  }

  const headers = ['nom', 'prenom', 'email', 'telephone', 'adresse', 'date_adhesion', 'statut'];
  const lines = [headers.join(',')];
  const access = buildAccessMetadata(request, clientAddress);

  for (const row of data ?? []) {
    lines.push([
      toCsvCell(row.nom),
      toCsvCell(row.prenom),
      toCsvCell(row.email),
      toCsvCell(row.telephone),
      toCsvCell(row.adresse),
      toCsvCell(row.date_adhesion),
      toCsvCell(row.statut),
    ].join(','));
  }

  // Log export operation
  await logAdherentOperation(
    ctx.adminSupabase,
    'EXPORT_ADHERENTS',
    {
      old: null,
      new: { count: data?.length ?? 0 },
      utilisateur_id: ctx.userId,
      access,
    }
  );

  return toCsvResponse(lines.join('\n'), 'adherents-export.csv');
};
