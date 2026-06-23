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
for (const f of files) {
  total++;
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, opts.target, true, ts.ScriptKind.TSX);
  for (const d of (sf.parseDiagnostics || [])) {
    if (d.category === ts.DiagnosticCategory.Error) {
      errors++;
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start || 0);
      console.log(f + ':' + (line+1) + ':' + (character+1) + '  ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      if (errors > 30) break;
    }
  }
  if (errors > 30) break;
}
console.log('---');
console.log('Files: ' + total + '  Syntax errors: ' + errors);
