import type { APIRoute } from 'astro';
import {
  buildAccessMetadata,
  getAdherentsAuthContext,
  hasAnyRole,
  jsonError,
  jsonOk,
  logAdherentOperation,
  splitCsvLine,
  validateAdherentPayload,
} from '@/lib/adherentsApi';

export const prerender = false;

interface CsvRow {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  adresse?: string;
  date_adhesion?: string;
  statut?: string;
}

function csvToRows(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? '').trim();
    });

    rows.push({
      nom: row.nom ?? '',
      prenom: row.prenom ?? '',
      email: row.email ?? '',
      telephone: row.telephone ?? '',
      adresse: row.adresse ?? '',
      date_adhesion: row.date_adhesion ?? '',
      statut: row.statut ?? '',
    });
  }

  return rows;
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier'])) {
    return jsonError('Acces refuse.', 403);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return jsonError('Fichier CSV requis (champ file).');

  const text = await file.text();
  const rows = csvToRows(text);
  if (rows.length === 0) return jsonError('Aucune ligne importable detectee.');
  const access = buildAccessMetadata(request, clientAddress);

  const validRows: Record<string, unknown>[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  rows.forEach((row, idx) => {
    const { payload, error } = validateAdherentPayload({
      nom: row.nom,
      prenom: row.prenom,
      email: row.email,
      telephone: row.telephone,
      adresse: row.adresse,
      date_adhesion: row.date_adhesion || new Date().toISOString().slice(0, 10),
      statut: row.statut || 'actif',
    }, false);

    if (error || !payload) {
      errors.push({ line: idx + 2, error: error ?? 'Ligne invalide.' });
      return;
    }

    validRows.push(payload);
  });

  if (validRows.length === 0) {
    return jsonError(`Import annule: ${errors.length} lignes invalides.`, 422);
  }

  const { data, error } = await ctx.adminSupabase
    .from('adherents')
    .upsert(validRows, { onConflict: 'email', ignoreDuplicates: false })
    .select('id');

  if (error) {
    console.error('[api/adherents/import] upsert error:', error.message);
    return jsonError('Erreur lors de l\'import.', 500);
  }

  // Log import operation
  await logAdherentOperation(
    ctx.adminSupabase,
    'IMPORT_ADHERENTS',
    {
      old: null,
      new: { count: validRows.length, skipped: errors.length },
      utilisateur_id: ctx.userId,
      access,
      meta: { imported: data?.length ?? validRows.length, errors: errors.length },
    }
  );

  return jsonOk({
    imported: data?.length ?? validRows.length,
    skipped: errors.length,
    errors,
  });
};
