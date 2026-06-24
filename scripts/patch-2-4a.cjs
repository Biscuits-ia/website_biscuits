const fs = require('fs');
const path = 'src/pages/api/admin/appointments.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Find a more robust anchor that won't depend on the original
// Re-use actual file content via a simpler match
const old = 'const adminDb = createSupabaseAdminClient();' + NL +
  '    const { data: appointments, error } = await adminDb' + NL +
  '      .from(\'volunteer_appointments\')' + NL +
  '      .select(\'*, appointment_slots(*)\')' + NL +
  '      .order(\'created_at\', { ascending: false });';

const newB = 'const adminDb = createSupabaseAdminClient();' + NL +
  '' + NL +
  '    // FIX P1 2.4 : pagination (page/limit) + filtres status/slot_id/from/to.' + NL +
  '    // Limite par defaut 50, max 200. Retourne { data, total, page, limit }.' + NL +
  '    const url = new URL(request.url);' + NL +
  '    const page = Math.max(1, parseInt(url.searchParams.get(\'page\') ?? \'1\', 10) || 1);' + NL +
  '    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get(\'limit\') ?? \'50\', 10) || 50));' + NL +
  '    const statusFilter = url.searchParams.get(\'status\') ?? \'\';' + NL +
  '    const slotFilter  = url.searchParams.get(\'slot_id\') ?? \'\';' + NL +
  '    const fromParam   = url.searchParams.get(\'from\') ?? \'\';' + NL +
  '    const toParam     = url.searchParams.get(\'to\') ?? \'\';' + NL +
  '    const offset = (page - 1) * limit;' + NL +
  '' + NL +
  '    let query = adminDb' + NL +
  '      .from(\'volunteer_appointments\')' + NL +
  '      .select(\'*, appointment_slots(*)\', { count: \'exact\' })' + NL +
  '      .order(\'created_at\', { ascending: false })' + NL +
  '      .range(offset, offset + limit - 1);' + NL +
  '    if (statusFilter) query = query.eq(\'status\', statusFilter);' + NL +
  '    if (slotFilter)  query = query.eq(\'slot_id\', slotFilter);' + NL +
  '    if (fromParam)   query = query.gte(\'created_at\', fromParam);' + NL +
  '    if (toParam) {' + NL +
  '      const toDate = new Date(toParam);' + NL +
  '      toDate.setDate(toDate.getDate() + 1);' + NL +
  '      query = query.lt(\'created_at\', toDate.toISOString());' + NL +
  '    }' + NL +
  '    const { data: appointments, error, count } = await query;';

if (!s.includes(old)) { console.error('NOT FOUND 2.4a query'); process.exit(1); }
s = s.replace(old, newB);

const oldRet = 'return new Response(JSON.stringify(enriched), { status: 200, headers: JSON_HEADERS });';
const newRet = 'return new Response(' + NL +
  '      JSON.stringify({ data: enriched, total: count ?? 0, page, limit }),' + NL +
  '      { status: 200, headers: JSON_HEADERS }' + NL +
  '    );';
if (!s.includes(oldRet)) { console.error('NOT FOUND 2.4a return'); process.exit(1); }
s = s.replace(oldRet, newRet);

fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.4a admin/appointments paginated');
