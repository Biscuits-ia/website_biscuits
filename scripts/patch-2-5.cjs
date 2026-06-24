const fs = require('fs');
const path = 'src/lib/email-queue.ts';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

const old =
  'export async function getOutboxStats(): Promise<OutboxStats> {' + NL +
  '  const admin = createSupabaseAdminClient();' + NL +
  '  const { data, error } = await admin' + NL +
  '    .from(\'email_outbox\')' + NL +
  '    .select(\'status\');' + NL +
  '  if (error || !data) {' + NL +
  '    return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };' + NL +
  '  }' + NL +
  '  const counts: OutboxStats = { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };' + NL +
  '  for (const r of data) {' + NL +
  '    counts.total += 1;' + NL +
  '    if (r.status === \'pending\') counts.pending += 1;' + NL +
  '    else if (r.status === \'sending\') counts.sending += 1;' + NL +
  '    else if (r.status === \'sent\') counts.sent += 1;' + NL +
  '    else if (r.status === \'failed\') counts.failed += 1;' + NL +
  '    else if (r.status === \'dead\') counts.dead += 1;' + NL +
  '  }' + NL +
  '  return counts;' + NL +
  '}';

const newB =
  'export async function getOutboxStats(): Promise<OutboxStats> {' + NL +
  '  // FIX P1 2.5 : appel de la RPC SQL get_outbox_stats() au lieu de SELECT *.' + NL +
  '  // Voir migration 20260624_get_outbox_stats_rpc.sql. Retourne 6 entiers.' + NL +
  '  const admin = createSupabaseAdminClient();' + NL +
  '  try {' + NL +
  '    const { data, error } = await admin.rpc(\'get_outbox_stats\');' + NL +
  '    if (error || !data) {' + NL +
  '      console.warn(\'[email-queue] get_outbox_stats RPC failed, fallback empty:\', error?.message);' + NL +
  '      return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };' + NL +
  '    }' + NL +
  '    const row = (Array.isArray(data) ? data[0] : data) as Partial<OutboxStats> | undefined;' + NL +
  '    if (!row) return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };' + NL +
  '    return {' + NL +
  '      pending: Number(row.pending ?? 0),' + NL +
  '      sending: Number(row.sending ?? 0),' + NL +
  '      sent:    Number(row.sent ?? 0),' + NL +
  '      failed:  Number(row.failed ?? 0),' + NL +
  '      dead:    Number(row.dead ?? 0),' + NL +
  '      total:   Number(row.total ?? 0),' + NL +
  '    };' + NL +
  '  } catch (err) {' + NL +
  '    console.error(\'[email-queue] getOutboxStats unexpected error:\', err);' + NL +
  '    return { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: 0 };' + NL +
  '  }' + NL +
  '}';

if (!s.includes(old)) { console.error('NOT FOUND 2.5'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.5');
