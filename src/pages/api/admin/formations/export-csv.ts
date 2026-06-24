// ============================================================================
// src/pages/api/admin/formations/export-csv.ts
// ----------------------------------------------------------------------------
// Genere un CSV du CA par formation / par mois pour la compta francaise.
// Format :
//   - Separateur  ;  (point-virgule, standard comptable FR)
//   - Encodage    UTF-8 avec BOM (compatible Excel/LibreOffice FR)
//   - Decimale    ,  (virgule, 2 chiffres)
//   - Dates       YYYY-MM-DD HH:MM:SS (ISO 8601)
//   - Quoting     minimal (entoure si le champ contient ; " ou nouvelle ligne)
//   - Totaux      ligne TOTAL a la fin, avec la somme de total_eur
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

const CSV_HEADERS = [
  'Mois',                  // YYYY-MM
  'Formation',
  'Mode de paiement',
  'Nombre de paiements',
  'Montant total (centimes)',
  'Montant total (EUR)',
];

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Echapper les guillemets et entourer si le champ contient ; " ou nouvelle ligne
  if (s.includes('"') || s.includes(';') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  // "2026-06-01T00:00:00+00:00" -> "2026-06"
  return iso.slice(0, 7);
}

function formatEur(cents: number): string {
  // Format francais : virgule decimale, 2 chiffres
  return (cents / 100).toFixed(2).replace('.', ',');
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return new Response('Forbidden', { status: 403 });

  // Filtres optionnels : ?from=YYYY-MM-DD&to=YYYY-MM-DD&training=ID
  const fromParam = url.searchParams.get('from') ?? '';
  const toParam   = url.searchParams.get('to') ?? '';
  const trainingParam = url.searchParams.get('training') ?? '';

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('training_payments')
    .select(`
      id, amount_cents, currency, status, provider, received_at, created_at,
      training_registrations (
        id, session_id,
        training_sessions (
          id, starts_at,
          trainings (id, title)
        )
      )
    `)
    .eq('status', 'received')
    .order('received_at', { ascending: false });

  if (fromParam) {
    query = query.gte('received_at', fromParam);
  }
  if (toParam) {
    // to est inclusif : on ajoute 1 jour
    const toDate = new Date(toParam);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt('received_at', toDate.toISOString());
  }
  if (trainingParam && /^[0-9a-f-]{36}$/i.test(trainingParam)) {
    // Filtre par formation : on ne peut pas filtrer directement via la relation,
    // donc on ramene tout et on filtre cote JS (volumes faibles attendus)
  }

  const { data, error } = await query.limit(10_000);
  if (error) {
    console.error('[admin/formations/export-csv] error:', error.message);
    return new Response('Erreur lors de la generation du CSV.', { status: 500 });
  }

  // Agregation par (mois, formation, mode de paiement)
  interface RowAgg {
    month:        string;
    trainingId:   string;
    trainingTitle: string;
    provider:     string;
    paymentsCount: number;
    totalCents:   number;
  }
  const aggMap = new Map<string, RowAgg>();
  let grandTotalCents = 0;
  let grandTotalCount = 0;

  for (const p of data ?? []) {
    const reg = Array.isArray(p.training_registrations)
      ? p.training_registrations[0]
      : p.training_registrations;
    if (!reg) continue;
    if (trainingParam && reg.training_sessions) {
      const session = Array.isArray(reg.training_sessions)
        ? reg.training_sessions[0]
        : reg.training_sessions;
      const training = session ? (Array.isArray((session as { trainings: unknown }).trainings)
        ? (session as { trainings: { id: string }[] }).trainings[0]
        : (session as { trainings: { id: string } }).trainings) : null;
      if (training && training.id !== trainingParam) continue;
    }
    const session = reg.training_sessions
      ? (Array.isArray(reg.training_sessions) ? reg.training_sessions[0] : reg.training_sessions)
      : null;
    const training = session
      ? (Array.isArray((session as { trainings: unknown }).trainings)
          ? (session as { trainings: { id: string; title: string }[] }).trainings[0]
          : (session as { trainings: { id: string; title: string } }).trainings)
      : null;
    if (!training) continue;

    const month = formatMonth(p.received_at);
    const key = `${month}|${training.id}|${p.provider}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.paymentsCount += 1;
      existing.totalCents += p.amount_cents;
    } else {
      aggMap.set(key, {
        month:         month,
        trainingId:    training.id,
        trainingTitle: training.title,
        provider:      p.provider,
        paymentsCount: 1,
        totalCents:    p.amount_cents,
      });
    }
    grandTotalCents += p.amount_cents;
    grandTotalCount += 1;
  }

  // Tri par mois desc, puis formation alpha, puis provider
  const rows = Array.from(aggMap.values()).sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    if (a.trainingTitle !== b.trainingTitle) return a.trainingTitle.localeCompare(b.trainingTitle);
    return a.provider.localeCompare(b.provider);
  });

  // Genere le CSV
  const lines: string[] = [CSV_HEADERS.join(';')];
  for (const r of rows) {
    lines.push([
      escapeCsvField(r.month),
      escapeCsvField(r.trainingTitle),
      escapeCsvField(r.provider),
      escapeCsvField(r.paymentsCount),
      escapeCsvField(r.totalCents),
      escapeCsvField(formatEur(r.totalCents)),
    ].join(';'));
  }
  // Ligne TOTAL
  lines.push('');
  lines.push([
    '',
    'TOTAL',
    '',
    escapeCsvField(grandTotalCount),
    escapeCsvField(grandTotalCents),
    escapeCsvField(formatEur(grandTotalCents)),
  ].join(';'));

  // BOM UTF-8 (3 octets EF BB BF) pour qu'Excel detecte l'encodage correctement
  const BOM = '\uFEFF';
  const csv = BOM + lines.join('\r\n') + '\r\n';

  // Nom de fichier avec date du jour
  const today = new Date().toISOString().slice(0, 10);
  const filenameParts = ['ca-formations', today];
  if (fromParam) filenameParts.push(`depuis-${fromParam}`);
  if (toParam) filenameParts.push(`jusqua-${toParam}`);
  const filename = `${filenameParts.join('_')}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};