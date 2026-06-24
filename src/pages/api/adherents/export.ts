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
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  // FIX P1 2.6 : filtres from/to via query params (?from=YYYY-MM-DD&to=YYYY-MM-DD),
  // meme pattern que formations/export-csv.ts. Limite dure 10 000 lignes.
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from') ?? '';
  const toParam   = url.searchParams.get('to') ?? '';

  let query = ctx.adminSupabase
    .from('adherents')
    .select('nom, prenom, email, telephone, adresse, date_adhesion, statut')
    .order('created_at', { ascending: false })
    .limit(10_000);
  if (fromParam) query = query.gte('date_adhesion', fromParam);
  if (toParam) {
    const toDate = new Date(toParam);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt('date_adhesion', toDate.toISOString().slice(0, 10));
  }
  const { data, error } = await query;

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
