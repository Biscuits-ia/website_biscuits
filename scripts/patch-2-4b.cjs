const fs = require('fs');
const path = 'src/pages/api/appointments/index.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

const old =
  '    const { data, error } = await supabase' + NL +
  '      .from(\'volunteer_appointments\')' + NL +
  '      .select(\'*\')' + NL +
  '      .order(\'created_at\', { ascending: false });' + NL +
  '' + NL +
  '    if (error) {' + NL +
  '      return new Response(' + NL +
  '        JSON.stringify({ error: error.message }),' + NL +
  '        { status: 500, headers: { \'Content-Type\': \'application/json\' } }' + NL +
  '      );' + NL +
  '    }' + NL +
  '' + NL +
  '    return new Response(' + NL +
  '      JSON.stringify(data),' + NL +
  '      { status: 200, headers: { \'Content-Type\': \'application/json\' } }' + NL +
  '    );';

const newB =
  '    // FIX P1 2.4 : pagination (page/limit) + filtres status/from/to' + NL +
  '    const url = new URL(request.url);' + NL +
  '    const page = Math.max(1, parseInt(url.searchParams.get(\'page\') ?? \'1\', 10) || 1);' + NL +
  '    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get(\'limit\') ?? \'50\', 10) || 50));' + NL +
  '    const statusFilter = url.searchParams.get(\'status\') ?? \'\';' + NL +
  '    const fromParam   = url.searchParams.get(\'from\') ?? \'\';' + NL +
  '    const toParam     = url.searchParams.get(\'to\') ?? \'\';' + NL +
  '    const offset = (page - 1) * limit;' + NL +
  '' + NL +
  '    let query = supabase' + NL +
  '      .from(\'volunteer_appointments\')' + NL +
  '      .select(\'*\', { count: \'exact\' })' + NL +
  '      .order(\'created_at\', { ascending: false })' + NL +
  '      .range(offset, offset + limit - 1);' + NL +
  '    if (statusFilter) query = query.eq(\'status\', statusFilter);' + NL +
  '    if (fromParam)   query = query.gte(\'created_at\', fromParam);' + NL +
  '    if (toParam) {' + NL +
  '      const toDate = new Date(toParam);' + NL +
  '      toDate.setDate(toDate.getDate() + 1);' + NL +
  '      query = query.lt(\'created_at\', toDate.toISOString());' + NL +
  '    }' + NL +
  '' + NL +
  '    const { data, error, count } = await query;' + NL +
  '' + NL +
  '    if (error) {' + NL +
  '      return new Response(' + NL +
  '        JSON.stringify({ error: error.message }),' + NL +
  '        { status: 500, headers: { \'Content-Type\': \'application/json\' } }' + NL +
  '      );' + NL +
  '    }' + NL +
  '' + NL +
  '    return new Response(' + NL +
  '      JSON.stringify({ data, total: count ?? 0, page, limit }),' + NL +
  '      { status: 200, headers: { \'Content-Type\': \'application/json\' } }' + NL +
  '    );';

if (!s.includes(old)) { console.error('NOT FOUND 2.4b'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.4b');
