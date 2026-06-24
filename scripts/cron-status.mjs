// ============================================================================
// scripts/cron-status.mjs
// ----------------------------------------------------------------------------
// Affiche l'etat du worker email (pg_cron) :
//   - job planifie
//   - dernieres executions (audit + status HTTP)
//   - statistiques de l'outbox (pending / sending / sent / failed / dead)
//
// Auth : SUPABASE_SERVICE_ROLE_KEY (server-only, bypass RLS).
// Cible : la base de donnees Supabase du projet.
//
// Usage :
//   npm run cron:status
//   npm run cron:status -- --json
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cron-status.mjs
// ============================================================================

import process from 'node:process';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[cron-status] Variables manquantes. Definir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

// --- Helpers ---------------------------------------------------------------

const REST_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const HEADERS = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept:        'application/json',
  'Content-Type': 'application/json',
};

async function rpc(fnName, args = {}) {
  const res = await fetch(`${REST_BASE}/rpc/${fnName}`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify(args),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`rpc ${fnName} -> ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function select(path) {
  const res = await fetch(`${REST_BASE}/${path}`, { headers: HEADERS });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${path} -> ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// --- Requetes --------------------------------------------------------------

async function fetchLastRuns() {
  return select('v_pg_cron_email_worker?limit=10&order=started_at.desc');
}

async function fetchOutboxStats() {
  const rows = await select('email_outbox?select=status&limit=10000');
  const stats = { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, total: rows.length };
  for (const r of rows) stats[r.status] = (stats[r.status] ?? 0) + 1;
  return stats;
}

async function fetchJobSchedule() {
  try {
    return await rpc('get_pg_cron_jobs');
  } catch {
    return null;
  }
}

// --- Affichage -------------------------------------------------------------

const args  = new Set(process.argv.slice(2));
const asJson = args.has('--json');

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function printTable(rows) {
  if (!rows || rows.length === 0) {
    console.log('  (aucune execution enregistree)');
    return;
  }
  const cols = [
    { key: 'started_at',    label: 'started_at',     w: 20 },
    { key: 'status_code',   label: 'http',           w:  5 },
    { key: 'timed_out',     label: 'to',             w:  3 },
    { key: 'response_body', label: 'response (head)', w: 60 },
  ];
  const header = cols.map((c) => c.label.padEnd(c.w)).join(' | ');
  console.log('  ' + header);
  console.log('  ' + cols.map((c) => '-'.repeat(c.w)).join('-+-'));
  for (const r of rows) {
    const line = cols
      .map((c) => {
        let v = r[c.key];
        if (v === null || v === undefined) v = '-';
        v = String(v);
        if (v.length > c.w) v = v.slice(0, c.w - 1) + '.';
        return v.padEnd(c.w);
      })
      .join(' | ');
    console.log('  ' + line);
  }
}

// --- Main ------------------------------------------------------------------

async function main() {
  const payload = {
    checked_at: new Date().toISOString(),
    outbox:     null,
    job:        null,
    last_runs:  null,
  };

  try { payload.outbox    = await fetchOutboxStats();  } catch (err) { payload.outbox    = { error: err.message }; }
  try { payload.job       = await fetchJobSchedule();  } catch (err) { payload.job       = { error: err.message }; }
  try { payload.last_runs = await fetchLastRuns();     } catch (err) { payload.last_runs = [{ error: err.message }]; }

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('');
  console.log('=== pg_cron email worker ===');
  console.log(`checked_at : ${fmtDate(payload.checked_at)}`);

  console.log('');
  console.log('Schedule (cron.job):');
  if (payload.job && Array.isArray(payload.job) && payload.job.length > 0) {
    for (const j of payload.job) {
      console.log(`  - ${j.jobname}  schedule='${j.schedule}'  active=${j.active}`);
    }
  } else {
    console.log('  n/a (deploye la RPC get_pg_cron_jobs si tu veux la voir ici)');
  }

  console.log('');
  console.log('Outbox stats:');
  if (payload.outbox && !payload.outbox.error) {
    console.log(`  total=${payload.outbox.total}`);
    for (const k of ['pending', 'sending', 'sent', 'failed', 'dead']) {
      console.log(`  ${k.padEnd(8)}= ${payload.outbox[k]}`);
    }
  } else {
    console.log('  ' + (payload.outbox?.error ?? 'n/a'));
  }

  console.log('');
  console.log('Last 10 runs:');
  if (Array.isArray(payload.last_runs)) {
    printTable(payload.last_runs);
  } else {
    console.log('  ' + (payload.last_runs?.error ?? 'n/a'));
  }

  console.log('');
  console.log('Astuce : SELECT public.invoke_email_outbox_worker(); -- declenche un run manuel');
  console.log('');
}

main().catch((err) => {
  console.error('[cron-status] erreur fatale :', err.message ?? err);
  process.exit(1);
});