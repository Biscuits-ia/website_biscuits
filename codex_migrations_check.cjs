const fs = require('fs');
const path = require('path');

function walk(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) results.push(...walk(p));
    else if (item.name.endsWith('.sql')) results.push(p);
  }
  return results;
}

const files = walk('supabase/migration').sort();

console.log('=== Inventaire des migrations ===\\n');
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n').length;
  const size = content.length;
  const hasTable = /CREATE TABLE[^;]*IF NOT EXISTS\s+(\w+)/i.test(content);
  const hasRLS = /ENABLE ROW LEVEL SECURITY/i.test(content);
  const hasPolicy = /CREATE POLICY/i.test(content);
  const hasFunction = /CREATE (OR REPLACE )?FUNCTION/i.test(content);
  const tables = [...content.matchAll(/CREATE TABLE[^;]*IF NOT EXISTS\s+(\w+)/gi)].map(m => m[1]);
  const policies = [...content.matchAll(/CREATE POLICY\s+(\w+)/gi)].map(m => m[1]);
  const fns = [...content.matchAll(/CREATE (OR REPLACE )?FUNCTION\s+(\w+)/gi)].map(m => m[2]);
  console.log(f);
  console.log('  lignes=' + lines + '  taille=' + size + ' bytes');
  if (tables.length) console.log('  tables: ' + tables.join(', '));
  if (policies.length) console.log('  policies: ' + policies.length);
  if (fns.length) console.log('  functions: ' + fns.join(', '));
}
