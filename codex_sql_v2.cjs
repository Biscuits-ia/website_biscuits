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

const files = walk('supabase/migration');
const issues = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/''[^']/) && !line.includes('NOT NULL')) {
      const m = line.match(/''([A-Za-z\[\^])/);
      if (m) issues.push({ file: f, line: i+1, content: line.trim() });
    }
  }
}

if (issues.length === 0) {
  console.log('OK - aucun pattern de double-apostrophe suspect dans les SQL');
} else {
  console.log('Patterns SQL suspects :');
  for (const i of issues) {
    console.log('  ' + i.file + ':' + i.line + '  ' + i.content);
  }
}
