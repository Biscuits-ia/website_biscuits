const fs = require('fs');
const path = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(path, 'utf8');
// The warning was on the const line `const { rateLimitResponse } = flat;` (unused, never accessed)
// But it IS used in `if (rateLimitResponse) return rateLimitResponse;` - so not unused.
// Re-check the warning: it was 'rateLimitResponse is declared but its value is never read'.
// That's a ts(6133) which fires when the variable is destructured but never used. Looking at code,
// it IS used. So perhaps the warning is stale. Let me explicitly silence by re-using it.
const old = "  const { rateLimitResponse } = flat;";
const newB = "  const { rateLimitResponse, ok, status, ctx: _ctx } = flat as any; void rateLimitResponse; void ok; void status; void _ctx;";
if (!s.includes(old)) { console.error('NOT FOUND h8'); process.exit(1); }
// Actually we cannot just change it - we need to be safer. Just add a void statement
const old2 = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx } = flat;\n  if (rateLimitResponse) return rateLimitResponse;";
const newB2 = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx, rateLimitResponse } = flat;\n  if (rateLimitResponse) return rateLimitResponse;";
s = s.replace(old2, newB2);
fs.writeFileSync(path, s, 'utf8');
console.log('OK h8');
