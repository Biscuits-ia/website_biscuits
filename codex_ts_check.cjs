const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function walk(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && item.name !== '.astro') {
        results.push(...walk(p));
      }
    } else if (/\.tsx?$/.test(item.name)) {
      results.push(p);
    }
  }
  return results;
}

const files = walk('src');
const opts = {
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  skipLibCheck: true,
  strict: false,
  isolatedModules: true,
  resolveJsonModule: true,
};

let total = 0, errors = 0;
const errsByFile = {};
for (const f of files) {
  total++;
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, opts.target, true, ts.ScriptKind.TSX);
  for (const d of (sf.parseDiagnostics || [])) {
    if (d.category === ts.DiagnosticCategory.Error) {
      errors++;
      errsByFile[f] = (errsByFile[f] || 0) + 1;
    }
  }
}
console.log('Files: ' + total + '  Syntax errors: ' + errors);
if (errors > 0) {
  console.log('\\nRepartition par fichier:');
  for (const [f, n] of Object.entries(errsByFile).sort((a,b) => b[1]-a[1]).slice(0, 20)) {
    console.log('  ' + n + '  ' + f);
  }
}
